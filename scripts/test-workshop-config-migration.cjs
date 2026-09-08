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
  "20260907240000_lab_send_timeout"
];
const WORKSHOP_CONFIG_MIGRATION = "20260908090000_workshop_config";

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
    await assertUpgradeMigrationDoesNotTouchExistingData();
  } finally {
    await resetKnownTables();
  }
}

async function assertEmptyDatabaseMigration() {
  await resetKnownTables();
  for (const migration of MIGRATIONS_BEFORE) {
    await applyMigration(migration);
  }
  await applyMigration(WORKSHOP_CONFIG_MIGRATION);

  await assertWorkshopConfigTable();

  const rows = await query("SELECT COUNT(*) AS count FROM workshop_config");
  if (Number(rows[0].count) !== 0) {
    throw new Error("Pusta baza nie powinna zawierać żadnego wiersza workshop_config po migracji.");
  }
}

async function assertUpgradeMigrationDoesNotTouchExistingData() {
  await resetKnownTables();
  for (const migration of MIGRATIONS_BEFORE) {
    await applyMigration(migration);
  }
  await insertWorkspace("workspace-a", "Klinika Konfiguracji A", "config-a");

  await applyMigration(WORKSHOP_CONFIG_MIGRATION);

  const workspaces = await query("SELECT COUNT(*) AS count FROM workspaces");
  if (Number(workspaces[0].count) !== 1) {
    throw new Error("Migracja workshop_config naruszyła istniejące workspace'y.");
  }

  await assertWorkshopConfigTable();
  await assertCanInsertAndUpsertSingletonRow();
}

async function assertWorkshopConfigTable() {
  const tables = await query("SHOW TABLES LIKE 'workshop_config'");
  if (tables.length !== 1) {
    throw new Error("Brakuje tabeli workshop_config.");
  }

  await assertColumnExists("workshop_config", "id");
  await assertColumnExists("workshop_config", "labScenario");
  await assertColumnExists("workshop_config", "controlledBug");
  await assertColumnExists("workshop_config", "updatedAt");
}

async function assertCanInsertAndUpsertSingletonRow() {
  await query(`
    INSERT INTO workshop_config (id, labScenario, controlledBug, updatedAt)
    VALUES ('singleton', 'SUCCESS', 'CLEAN', CURRENT_TIMESTAMP(3))
  `);

  await expectConstraintFailure(
    `
    INSERT INTO workshop_config (id, labScenario, controlledBug, updatedAt)
    VALUES ('singleton', 'SERVER_ERROR', 'CLEAN', CURRENT_TIMESTAMP(3))
  `,
    "Baza pozwoliła wstawić drugi wiersz z tym samym id (naruszenie PRIMARY KEY)."
  );

  await query(`
    UPDATE workshop_config
    SET labScenario = 'SERVER_ERROR', updatedAt = CURRENT_TIMESTAMP(3)
    WHERE id = 'singleton'
  `);

  const rows = await query("SELECT labScenario, controlledBug FROM workshop_config WHERE id = 'singleton'");
  if (rows.length !== 1 || rows[0].labScenario !== "SERVER_ERROR" || rows[0].controlledBug !== "CLEAN") {
    throw new Error("Aktualizacja jedynego wiersza workshop_config nie zadziałała poprawnie.");
  }
}

async function assertColumnExists(table, column) {
  const rows = await query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
  if (rows.length !== 1) {
    throw new Error(`Brakuje kolumny ${table}.${column}.`);
  }
}

async function expectConstraintFailure(sql, message) {
  let failed = false;
  try {
    await query(sql);
  } catch {
    failed = true;
  }

  if (!failed) {
    throw new Error(message);
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

async function resetKnownTables() {
  await query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of [
    "workshop_config",
    "order_history",
    "lab_send_retry_jobs",
    "processed_lab_events",
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
