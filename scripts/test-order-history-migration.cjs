const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { URL } = require("node:url");
const mariadb = require("mariadb");
const {
  assertSafeTestDatabaseUrl
} = require("./test-database-safety.cjs");

const repoRoot = join(__dirname, "..");
const databaseUrl = process.env.TEST_DATABASE_URL;

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
    await assertUpgradeMigrationWithBackfillAndConstraints();
  } finally {
    await resetKnownTables();
  }
}

async function assertEmptyDatabaseMigration() {
  await resetKnownTables();
  await applyAllMigrations();
  await assertOrderHistoryTableAndEnums();

  const rows = await query("SELECT COUNT(*) AS count FROM order_history");
  if (Number(rows[0].count) !== 0) {
    throw new Error("Pusta baza nie powinna zawierać żadnych wpisów historii po migracji.");
  }
}

async function assertUpgradeMigrationWithBackfillAndConstraints() {
  await resetKnownTables();
  await applyMigration("20260904120000_init");
  await applyMigration("20260905150000_extend_patients");
  await applyMigration("20260906100000_orders_foundation");
  await applyMigration("20260906180000_orders_send_idempotency");
  await applyMigration("20260906190000_lab_results_pipeline");
  await insertExistingData();
  await applyMigration("20260907120000_order_history");

  await assertExistingDataPreserved();
  await assertOrderHistoryTableAndEnums();
  await assertBackfillCreatedOneEntryPerOrder();
  await assertBackfillIsIdempotentIfReapplied();
  await assertWorkspaceIsolationConstraints();
  await assertIntegrationEventUniqueConstraint();
}

async function applyAllMigrations() {
  await applyMigration("20260904120000_init");
  await applyMigration("20260905150000_extend_patients");
  await applyMigration("20260906100000_orders_foundation");
  await applyMigration("20260906180000_orders_send_idempotency");
  await applyMigration("20260906190000_lab_results_pipeline");
  await applyMigration("20260907120000_order_history");
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

async function insertExistingData() {
  await insertWorkspace("workspace-a", "Klinika Historii A", "history-a");
  await insertWorkspace("workspace-b", "Klinika Historii B", "history-b");
  await insertUser("user-a", "workspace-a", "history.staff.a");
  await insertUser("user-b", "workspace-b", "history.staff.b");
  await insertPatient("patient-a", "workspace-a", "Anna", "Historyczna", "02270803624");
  await insertPatient("patient-b", "workspace-b", "Jan", "Historyczny", "44051401458");
  await insertOrder("order-a", "workspace-a", "patient-a", "user-a", "2026-09-01T08:00:00.000");
  await insertOrder("order-a-2", "workspace-a", "patient-a", "user-a", "2026-09-02T08:00:00.000");
  await insertOrder("order-b", "workspace-b", "patient-b", "user-b", "2026-09-03T08:00:00.000");
}

async function assertExistingDataPreserved() {
  const orders = await query("SELECT COUNT(*) AS count FROM orders");
  const users = await query("SELECT COUNT(*) AS count FROM users");
  const patients = await query("SELECT COUNT(*) AS count FROM patients");
  if (
    Number(orders[0].count) !== 3 ||
    Number(users[0].count) !== 2 ||
    Number(patients[0].count) !== 2
  ) {
    throw new Error(
      "Migracja historii zleceń naruszyła istniejące zlecenia, konta albo pacjentów."
    );
  }
}

async function assertOrderHistoryTableAndEnums() {
  const rows = await query("SHOW TABLES LIKE 'order_history'");
  if (rows.length !== 1) {
    throw new Error("Brakuje tabeli order_history.");
  }

  await assertColumnTypeIncludes("order_history", "eventType", "LAB_RESULT_RECEIVED");
  await assertColumnTypeIncludes("order_history", "eventType", "TECHNICAL_ERROR");
  await assertColumnTypeIncludes("order_history", "actorType", "LAB");
  await assertColumnTypeIncludes("order_history", "previousStatus", "SENT_TO_LAB");
}

async function assertBackfillCreatedOneEntryPerOrder() {
  const rows = await query(`
    SELECT orderId, actorUserId, actorType, previousStatus, newStatus, occurredAt, details
    FROM order_history
    WHERE eventType = 'ORDER_CREATED'
    ORDER BY orderId
  `);

  if (rows.length !== 3) {
    throw new Error(
      `Backfill powinien utworzyć dokładnie jeden wpis ORDER_CREATED na zlecenie (znaleziono ${rows.length}).`
    );
  }

  for (const row of rows) {
    if (row.actorType !== "STAFF") {
      throw new Error("Odtworzony wpis powinien mieć wykonawcę STAFF.");
    }
    if (row.previousStatus !== null) {
      throw new Error("Odtworzony wpis ORDER_CREATED nie powinien mieć poprzedniego statusu.");
    }
    if (row.newStatus !== "DRAFT") {
      throw new Error("Odtworzony wpis ORDER_CREATED powinien wskazywać status DRAFT.");
    }
    const details = typeof row.details === "string" ? JSON.parse(row.details) : row.details;
    if (details.reconstructed !== true) {
      throw new Error("Odtworzony wpis powinien być oznaczony jako reconstructed.");
    }
  }

  const orderARow = rows.find((row) => row.orderId === "order-a");
  if (!orderARow || orderARow.actorUserId !== "user-a") {
    throw new Error("Odtworzony wpis powinien wskazywać createdByUserId zlecenia jako wykonawcę.");
  }
}

async function assertBackfillIsIdempotentIfReapplied() {
  // Ponowne uruchomienie backfillu (np. ręczne powtórzenie skryptu migracji) nie może
  // podwoić wpisów ORDER_CREATED — sekcja backfillu migracji chroni się warunkiem NOT EXISTS.
  const backfillSql = extractBackfillStatement(
    readFileSync(
      join(repoRoot, "prisma", "migrations", "20260907120000_order_history", "migration.sql"),
      "utf8"
    )
  );
  await query(backfillSql);

  const rows = await query(
    "SELECT COUNT(*) AS count FROM order_history WHERE eventType = 'ORDER_CREATED'"
  );
  if (Number(rows[0].count) !== 3) {
    throw new Error("Ponowne uruchomienie backfillu nie powinno tworzyć duplikatów.");
  }
}

async function assertWorkspaceIsolationConstraints() {
  await expectConstraintFailure(`
    INSERT INTO order_history (
      id, workspaceId, orderId, eventType, actorType, occurredAt, details
    )
    VALUES (
      'history-bad-order', 'workspace-a', 'order-b', 'ORDER_CREATED', 'STAFF', CURRENT_TIMESTAMP(3), '{}'
    )
  `, "Baza pozwoliła powiązać historię ze zleceniem z innego workspace'u.");

  await expectConstraintFailure(`
    INSERT INTO order_history (
      id, workspaceId, orderId, eventType, actorType, actorUserId, occurredAt, details
    )
    VALUES (
      'history-bad-actor', 'workspace-a', 'order-a', 'ORDER_CREATED', 'STAFF', 'user-b', CURRENT_TIMESTAMP(3), '{}'
    )
  `, "Baza pozwoliła powiązać historię z użytkownikiem z innego workspace'u.");
}

async function assertIntegrationEventUniqueConstraint() {
  await query(`
    INSERT INTO order_history (
      id, workspaceId, orderId, eventType, actorType, integrationEventId, occurredAt, details
    )
    VALUES (
      'history-evt-1', 'workspace-a', 'order-a', 'LAB_RESULT_RECEIVED', 'LAB', 'evt-migration-1', CURRENT_TIMESTAMP(3), '{}'
    )
  `);

  await expectConstraintFailure(`
    INSERT INTO order_history (
      id, workspaceId, orderId, eventType, actorType, integrationEventId, occurredAt, details
    )
    VALUES (
      'history-evt-1-duplicate', 'workspace-a', 'order-a', 'LAB_RESULT_RECEIVED', 'LAB', 'evt-migration-1', CURRENT_TIMESTAMP(3), '{}'
    )
  `, "Baza pozwoliła zapisać dwa wpisy historii dla tego samego integracyjnego eventId i typu zdarzenia.");

  // NULL integrationEventId może wystąpić wielokrotnie (większość zdarzeń nie pochodzi z integracji).
  await query(`
    INSERT INTO order_history (
      id, workspaceId, orderId, eventType, actorType, occurredAt, details
    )
    VALUES (
      'history-null-evt-1', 'workspace-a', 'order-a', 'ORDER_UPDATED', 'STAFF', CURRENT_TIMESTAMP(3), '{}'
    )
  `);
  await query(`
    INSERT INTO order_history (
      id, workspaceId, orderId, eventType, actorType, occurredAt, details
    )
    VALUES (
      'history-null-evt-2', 'workspace-a', 'order-a', 'ORDER_UPDATED', 'STAFF', CURRENT_TIMESTAMP(3), '{}'
    )
  `);
}

function extractBackfillStatement(sql) {
  const marker = "-- Backfill:";
  const startIndex = sql.indexOf(marker);
  if (startIndex === -1) {
    throw new Error("Nie znaleziono sekcji backfillu w migracji historii.");
  }
  return sql.slice(startIndex).trim().replace(/;\s*$/, "");
}

async function assertColumnTypeIncludes(table, column, expected) {
  const rows = await query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
  if (
    !rows[0] ||
    !String(rows[0].Type).toUpperCase().includes(expected.toUpperCase())
  ) {
    throw new Error(`Kolumna ${table}.${column} nie zawiera wartości ${expected}.`);
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
      id,
      workspaceId,
      firstName,
      lastName,
      identifierType,
      pesel,
      birthDate,
      gender,
      active,
      updatedAt
    )
    VALUES (
      '${id}',
      '${workspaceId}',
      '${firstName}',
      '${lastName}',
      'PESEL',
      '${pesel}',
      '1990-01-01',
      'FEMALE',
      true,
      CURRENT_TIMESTAMP(3)
    )
  `);
}

async function insertOrder(id, workspaceId, patientId, userId, createdAt) {
  await query(`
    INSERT INTO orders (
      id, workspaceId, patientId, createdByUserId, priority, createdAt, updatedAt
    )
    VALUES (
      '${id}', '${workspaceId}', '${patientId}', '${userId}', 'ROUTINE', '${createdAt}', CURRENT_TIMESTAMP(3)
    )
  `);
}

async function resetKnownTables() {
  await query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of [
    "order_history",
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
