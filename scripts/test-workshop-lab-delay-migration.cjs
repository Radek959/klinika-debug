const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { URL } = require("node:url");
const mariadb = require("mariadb");
const {
  assertSafeTestDatabaseUrl
} = require("./test-database-safety.cjs");

const repoRoot = join(__dirname, "..");
const databaseUrl = process.env.TEST_DATABASE_URL;

const MIGRATIONS_BEFORE = [
  "20260904120000_init",
  "20260905150000_extend_patients",
  "20260906100000_orders_foundation",
  "20260906180000_orders_send_idempotency",
  "20260906190000_lab_results_pipeline",
  "20260907120000_order_history",
  "20260907190000_lab_sample_rejected",
  "20260907210000_lab_order_rejected",
  "20260907230000_lab_send_retry",
  "20260907240000_lab_send_timeout",
  "20260908090000_workshop_config"
];
const LAB_DELAY_MIGRATION = "20260908130000_workshop_lab_delay";

try {
  assertSafeTestDatabaseUrl({
    databaseUrl,
    nodeEnv: process.env.NODE_ENV
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

let connection;

run()
  .then(async () => {
    await disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await disconnect();
    process.exit(1);
  });

async function run() {
  connection = await mariadb.createConnection(parseDatabaseUrl(databaseUrl));
  process.env.DATABASE_URL = databaseUrl;

  try {
    await assertEmptyDatabaseMigration();
    await assertUpgradeMigrationBackfillsDefaultAndPreservesData();
  } finally {
    await resetKnownTables();
  }
}

async function assertEmptyDatabaseMigration() {
  await resetKnownTables();
  for (const migration of MIGRATIONS_BEFORE) {
    await applyMigration(migration);
  }
  await applyMigration(LAB_DELAY_MIGRATION);

  await assertColumnExists("workshop_config", "labDelayMs");
  await assertColumnExists("lab_send_retry_jobs", "labDelayMs");

  const configRows = await query("SELECT COUNT(*) AS count FROM workshop_config");
  if (Number(configRows[0].count) !== 0) {
    throw new Error("Pusta baza nie powinna zawierać żadnego wiersza workshop_config po migracji.");
  }
}

async function assertUpgradeMigrationBackfillsDefaultAndPreservesData() {
  await resetKnownTables();
  for (const migration of MIGRATIONS_BEFORE) {
    await applyMigration(migration);
  }
  await insertExistingData();

  await applyMigration(LAB_DELAY_MIGRATION);

  await assertExistingWorkshopConfigRowGotDefault();
  await assertExistingRetryJobRowGotDefault();
  await assertExistingDataOtherwiseUnchanged();
  await assertNewRowsCanSetExplicitLabDelayMs();
}

async function assertExistingWorkshopConfigRowGotDefault() {
  const rows = await query(
    "SELECT labScenario, controlledBug, labDelayMs FROM workshop_config WHERE id = 'singleton'"
  );
  if (rows.length !== 1) {
    throw new Error("Migracja usunęła istniejący wiersz workshop_config.");
  }
  if (rows[0].labScenario !== "SUCCESS" || rows[0].controlledBug !== "CLEAN") {
    throw new Error("Migracja naruszyła istniejące wartości workshop_config.");
  }
  if (Number(rows[0].labDelayMs) !== 300000) {
    throw new Error(
      "Istniejący wiersz workshop_config musi dostać domyślne labDelayMs = 300000."
    );
  }
}

async function assertExistingRetryJobRowGotDefault() {
  const rows = await query(
    "SELECT scenario, correlationId, labDelayMs FROM lab_send_retry_jobs WHERE id = 'retry-existing-1'"
  );
  if (rows.length !== 1) {
    throw new Error("Migracja usunęła istniejące zadanie lab_send_retry_jobs.");
  }
  if (rows[0].scenario !== "RATE_LIMIT" || rows[0].correlationId !== "corr-existing-1") {
    throw new Error("Migracja naruszyła istniejące wartości lab_send_retry_jobs.");
  }
  if (Number(rows[0].labDelayMs) !== 300000) {
    throw new Error(
      "Istniejące zadanie lab_send_retry_jobs musi dostać domyślne labDelayMs = 300000, żeby zachowany był dotychczasowy delay pierwotnego chaina."
    );
  }
}

async function assertExistingDataOtherwiseUnchanged() {
  const orders = await query("SELECT id, status FROM orders ORDER BY id");
  if (
    orders.length !== 1 ||
    orders[0].id !== "order-a" ||
    orders[0].status !== "SAMPLE_COLLECTED"
  ) {
    throw new Error("Migracja naruszyła istniejące zlecenia — migracja musi być addytywna.");
  }
}

async function assertNewRowsCanSetExplicitLabDelayMs() {
  await query(`
    UPDATE workshop_config SET labDelayMs = 5000 WHERE id = 'singleton'
  `);
  const config = await query("SELECT labDelayMs FROM workshop_config WHERE id = 'singleton'");
  if (Number(config[0].labDelayMs) !== 5000) {
    throw new Error("Po migracji nie da się zapisać wybranego presetu labDelayMs w workshop_config.");
  }

  await query(`
    INSERT INTO lab_send_retry_jobs (
      id, workspaceId, orderId, attemptNumber, executeAt, status, correlationId,
      scenario, labDelayMs, idempotencyKey, requestHash, updatedAt
    )
    VALUES (
      'retry-new-1', 'workspace-a', 'order-a', 2, CURRENT_TIMESTAMP(3), 'PENDING',
      'corr-new-1', 'SERVER_ERROR', 15000, 'send-order-a-new', 'hash-new', CURRENT_TIMESTAMP(3)
    )
  `);
  const retry = await query("SELECT labDelayMs FROM lab_send_retry_jobs WHERE id = 'retry-new-1'");
  if (Number(retry[0].labDelayMs) !== 15000) {
    throw new Error("Po migracji nowe zadanie ponowienia musi utrwalić jawnie podany labDelayMs.");
  }
}

async function insertExistingData() {
  await insertWorkspace("workspace-a", "Klinika Delay A", "delay-a");
  await insertUser("user-a", "workspace-a", "delay.staff.a");
  await insertPatient("patient-a", "workspace-a", "Anna", "Delay", "02270803624");
  await insertOrder("order-a", "workspace-a", "patient-a", "user-a", "SAMPLE_COLLECTED");

  await query(`
    INSERT INTO workshop_config (id, labScenario, controlledBug, updatedAt)
    VALUES ('singleton', 'SUCCESS', 'CLEAN', CURRENT_TIMESTAMP(3))
  `);

  await query(`
    INSERT INTO lab_send_retry_jobs (
      id, workspaceId, orderId, attemptNumber, executeAt, status, correlationId,
      scenario, idempotencyKey, requestHash, updatedAt
    )
    VALUES (
      'retry-existing-1', 'workspace-a', 'order-a', 2, CURRENT_TIMESTAMP(3), 'PENDING',
      'corr-existing-1', 'RATE_LIMIT', 'send-order-a-existing', 'hash-existing', CURRENT_TIMESTAMP(3)
    )
  `);
}

async function assertColumnExists(table, column) {
  const rows = await query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
  if (rows.length !== 1) {
    throw new Error(`Brakuje kolumny ${table}.${column}.`);
  }
}

async function applyMigration(name) {
  const sql = readFileSync(
    join(repoRoot, "prisma", "migrations", name, "migration.sql"),
    "utf8"
  );

  for (const statement of splitStatements(sql)) {
    await query(statement);
  }
}

async function insertWorkspace(id, name, slug) {
  await query(`
    INSERT INTO workspaces (id, name, slug, updatedAt)
    VALUES ('${id}', '${name}', '${slug}', CURRENT_TIMESTAMP(3))
  `);
}

async function insertUser(id, workspaceId, login) {
  await query(`
    INSERT INTO users (
      id, workspaceId, login, displayName, passwordHash, updatedAt
    )
    VALUES (
      '${id}', '${workspaceId}', '${login}', 'Personel ${login}', 'hash', CURRENT_TIMESTAMP(3)
    )
  `);
}

async function insertPatient(id, workspaceId, firstName, lastName, pesel) {
  await query(`
    INSERT INTO patients (
      id, workspaceId, firstName, lastName, identifierType, pesel,
      birthDate, gender, active, updatedAt
    )
    VALUES (
      '${id}', '${workspaceId}', '${firstName}', '${lastName}', 'PESEL', '${pesel}',
      '1990-01-01', 'FEMALE', true, CURRENT_TIMESTAMP(3)
    )
  `);
}

async function insertOrder(id, workspaceId, patientId, userId, status) {
  await query(`
    INSERT INTO orders (
      id, workspaceId, patientId, createdByUserId, priority, status, updatedAt
    )
    VALUES (
      '${id}', '${workspaceId}', '${patientId}', '${userId}', 'ROUTINE', '${status}',
      CURRENT_TIMESTAMP(3)
    )
  `);
}

async function resetKnownTables() {
  await query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of [
    "workshop_config",
    "order_history",
    "processed_lab_events",
    "lab_send_retry_jobs",
    "lab_jobs",
    "results",
    "idempotency_keys",
    "samples",
    "order_tests",
    "orders",
    "medical_test_required_fields",
    "test_parameters",
    "medical_tests",
    "guardians",
    "patients",
    "user_sessions",
    "users",
    "workspaces",
    "_prisma_migrations"
  ]) {
    await query(`DROP TABLE IF EXISTS ${table}`);
  }
  await query("SET FOREIGN_KEY_CHECKS = 1");
}

async function query(sql) {
  return connection.query(sql);
}

async function disconnect() {
  if (connection) {
    await connection.end();
  }
}

function splitStatements(sql) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function parseDatabaseUrl(value) {
  const parsed = new URL(value);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\/+/, "")),
    allowPublicKeyRetrieval: true
  };
}
