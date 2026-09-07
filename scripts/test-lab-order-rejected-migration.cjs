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
  "20260907190000_lab_sample_rejected"
];
const ORDER_REJECTED_MIGRATION = "20260907210000_lab_order_rejected";

// Wszystkie wartości enumu order_history.eventType, które muszą działać PO migracji.
// Wartości sprzed migracji nie mogą zniknąć — migracja jest wyłącznie addytywna.
const EVENT_TYPES_BEFORE = [
  "ORDER_CREATED",
  "ORDER_UPDATED",
  "SAMPLE_REGISTERED",
  "ORDER_SENT_TO_LAB",
  "LAB_ORDER_ACCEPTED",
  "LAB_RESULT_RECEIVED",
  "LAB_SAMPLE_REJECTED",
  "TECHNICAL_ERROR"
];

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
    await assertUpgradeMigrationPreservesExistingOrders();
  } finally {
    await resetKnownTables();
  }
}

async function assertEmptyDatabaseMigration() {
  await resetKnownTables();
  for (const migration of MIGRATIONS_BEFORE) {
    await applyMigration(migration);
  }
  await applyMigration(ORDER_REJECTED_MIGRATION);

  await assertOrderRejectedEnumValues();

  const orders = await query("SELECT COUNT(*) AS count FROM orders");
  if (Number(orders[0].count) !== 0) {
    throw new Error("Pusta baza nie powinna zawierać zleceń po migracji.");
  }
}

async function assertUpgradeMigrationPreservesExistingOrders() {
  await resetKnownTables();
  for (const migration of MIGRATIONS_BEFORE) {
    await applyMigration(migration);
  }
  await insertExistingData();

  const before = await readOrderTestStatuses();
  const historyBefore = await query(
    "SELECT COUNT(*) AS count FROM order_history"
  );

  await applyMigration(ORDER_REJECTED_MIGRATION);

  await assertOrderRejectedEnumValues();
  await assertExistingDataPreserved(before, Number(historyBefore[0].count));
  await assertNewEnumValuesAreUsable();
  await assertOldEnumValuesStillRejectUnknownValues();
}

async function assertOrderRejectedEnumValues() {
  // Nowa wartość jest dostępna...
  await assertColumnTypeIncludes("order_history", "eventType", "LAB_ORDER_REJECTED");
  // ...a wszystkie wcześniejsze wartości enumu zostały zachowane.
  for (const eventType of EVENT_TYPES_BEFORE) {
    await assertColumnTypeIncludes("order_history", "eventType", eventType);
  }

  // Migracja nie może dotykać enumu statusów badań ani kolumn odrzucenia próbki.
  await assertColumnTypeIncludes("order_tests", "status", "PENDING");
  await assertColumnTypeIncludes("order_tests", "status", "COMPLETED");
  await assertColumnTypeIncludes("order_tests", "status", "REJECTED");
  await assertColumnExists("samples", "rejectionCode");
  await assertColumnExists("samples", "rejectionReason");

  const rows = await query("SHOW COLUMNS FROM order_history LIKE 'eventType'");
  if (String(rows[0].Null) !== "NO") {
    throw new Error(
      "Migracja nie może zmieniać nullowalności kolumny order_history.eventType."
    );
  }
  if (rows[0].Default !== null && String(rows[0].Default) !== "") {
    throw new Error(
      "Migracja nie może nadawać kolumnie order_history.eventType wartości domyślnej."
    );
  }
}

async function assertExistingDataPreserved(statusesBefore, historyCountBefore) {
  const statusesAfter = await readOrderTestStatuses();
  if (JSON.stringify(statusesBefore) !== JSON.stringify(statusesAfter)) {
    throw new Error(
      "Migracja zmieniła statusy istniejących badań zlecenia — migracja musi być addytywna."
    );
  }

  const orders = await query("SELECT COUNT(*) AS count FROM orders");
  const samples = await query("SELECT COUNT(*) AS count FROM samples");
  const history = await query("SELECT COUNT(*) AS count FROM order_history");
  if (
    Number(orders[0].count) !== 2 ||
    Number(samples[0].count) !== 2 ||
    Number(history[0].count) !== historyCountBefore
  ) {
    throw new Error(
      "Migracja naruszyła istniejące zlecenia, próbki albo wpisy historii."
    );
  }

  const existing = await query(
    "SELECT eventType FROM order_history WHERE id = 'history-existing-1'"
  );
  if (existing.length !== 1 || existing[0].eventType !== "ORDER_CREATED") {
    throw new Error(
      "Migracja naruszyła typ zdarzenia istniejącego wpisu historii."
    );
  }

  const rejectedSample = await query(
    "SELECT eventType FROM order_history WHERE id = 'history-existing-2'"
  );
  if (rejectedSample.length !== 1 || rejectedSample[0].eventType !== "LAB_SAMPLE_REJECTED") {
    throw new Error(
      "Migracja naruszyła wpis historii zapisany wcześniejszą wartością enumu."
    );
  }
}

async function assertNewEnumValuesAreUsable() {
  // Po migracji da się zapisać nowe zdarzenie historii razem z jego szczegółami.
  await query(`
    INSERT INTO order_history (
      id, workspaceId, orderId, eventType, actorType, correlationId, occurredAt,
      previousStatus, newStatus, details
    )
    VALUES (
      'history-order-rejected-1', 'workspace-a', 'order-a', 'LAB_ORDER_REJECTED', 'LAB',
      'corr-order-rejected-1', CURRENT_TIMESTAMP(3), 'SAMPLE_COLLECTED', 'SAMPLE_COLLECTED',
      '{"rejectionType":"VALIDATION","errorCode":"LAB_ORDER_VALIDATION_ERROR","fieldErrors":[],"previousStatus":"SAMPLE_COLLECTED","newStatus":"SAMPLE_COLLECTED"}'
    )
  `);
  const history = await query(
    "SELECT eventType, previousStatus, newStatus FROM order_history WHERE id = 'history-order-rejected-1'"
  );
  if (history[0].eventType !== "LAB_ORDER_REJECTED") {
    throw new Error("Po migracji nie da się zapisać zdarzenia LAB_ORDER_REJECTED.");
  }
  if (
    history[0].previousStatus !== "SAMPLE_COLLECTED" ||
    history[0].newStatus !== "SAMPLE_COLLECTED"
  ) {
    throw new Error(
      "Zdarzenie LAB_ORDER_REJECTED musi dać się zapisać bez zmiany statusu zlecenia."
    );
  }

  // Wartości enumu sprzed migracji nadal działają.
  for (const [index, eventType] of EVENT_TYPES_BEFORE.entries()) {
    const id = `history-legacy-${index}`;
    await query(`
      INSERT INTO order_history (
        id, workspaceId, orderId, eventType, actorType, occurredAt, details
      )
      VALUES (
        '${id}', 'workspace-a', 'order-a', '${eventType}', 'LAB', CURRENT_TIMESTAMP(3), '{}'
      )
    `);
    const rows = await query(
      `SELECT eventType FROM order_history WHERE id = '${id}'`
    );
    if (rows[0].eventType !== eventType) {
      throw new Error(
        `Po migracji nie da się zapisać wcześniejszej wartości enumu ${eventType}.`
      );
    }
  }
}

async function assertOldEnumValuesStillRejectUnknownValues() {
  // Rozszerzenie enumu nie może zamienić kolumny na dowolny tekst.
  await expectConstraintFailure(
    "INSERT INTO order_history (id, workspaceId, orderId, eventType, actorType, occurredAt, details) VALUES ('history-bad-enum', 'workspace-a', 'order-a', 'NOT_AN_EVENT', 'LAB', CURRENT_TIMESTAMP(3), '{}')",
    "Baza przyjęła nieznaną wartość enumu order_history.eventType."
  );
}

async function readOrderTestStatuses() {
  return query("SELECT id, status FROM order_tests ORDER BY id");
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
  await insertWorkspace("workspace-a", "Klinika Odrzuceń A", "rejection-a");
  await insertWorkspace("workspace-b", "Klinika Odrzuceń B", "rejection-b");
  await insertUser("user-a", "workspace-a", "rejection.staff.a");
  await insertUser("user-b", "workspace-b", "rejection.staff.b");
  await insertPatient("patient-a", "workspace-a", "Anna", "Odrzucona", "02270803624");
  await insertPatient("patient-b", "workspace-b", "Jan", "Odrzucony", "44051401458");
  await insertOrder("order-a", "workspace-a", "patient-a", "user-a", "PROCESSING");
  await insertOrder("order-b", "workspace-b", "patient-b", "user-b", "COMPLETED");
  await insertMedicalTest("test-crp", "CRP", "SERUM");
  await insertOrderTest("order-test-a", "workspace-a", "order-a", "test-crp", "PENDING");
  await insertOrderTest("order-test-b", "workspace-b", "order-b", "test-crp", "COMPLETED");
  await insertSample("sample-a", "workspace-a", "order-a", "SERUM", "SENT");
  await insertSample("sample-b", "workspace-b", "order-b", "SERUM", "ACCEPTED");
  await query(`
    INSERT INTO order_history (
      id, workspaceId, orderId, eventType, actorType, actorUserId, occurredAt, details
    )
    VALUES (
      'history-existing-1', 'workspace-a', 'order-a', 'ORDER_CREATED', 'STAFF', 'user-a',
      CURRENT_TIMESTAMP(3), '{}'
    )
  `);
  // Wpis zapisany ostatnią wartością enumu dodaną przed tą migracją — sprawdza,
  // że rozszerzenie listy wartości nie gubi wcześniej zapisanych zdarzeń.
  await query(`
    INSERT INTO order_history (
      id, workspaceId, orderId, eventType, actorType, occurredAt, details
    )
    VALUES (
      'history-existing-2', 'workspace-a', 'order-a', 'LAB_SAMPLE_REJECTED', 'LAB',
      CURRENT_TIMESTAMP(3), '{}'
    )
  `);
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

async function insertMedicalTest(id, code, materialType) {
  await query(`
    INSERT INTO medical_tests (
      id, code, name, description, materialType, estimatedDurationMinutes, active, updatedAt
    )
    VALUES (
      '${id}', '${code}', 'Badanie ${code}', 'Opis badania ${code}', '${materialType}',
      60, true, CURRENT_TIMESTAMP(3)
    )
  `);
}

async function insertOrderTest(id, workspaceId, orderId, medicalTestId, status) {
  await query(`
    INSERT INTO order_tests (
      id, workspaceId, orderId, medicalTestId, status, updatedAt
    )
    VALUES (
      '${id}', '${workspaceId}', '${orderId}', '${medicalTestId}', '${status}',
      CURRENT_TIMESTAMP(3)
    )
  `);
}

async function insertSample(id, workspaceId, orderId, materialType, status) {
  await query(`
    INSERT INTO samples (
      id, workspaceId, orderId, materialType, status, updatedAt
    )
    VALUES (
      '${id}', '${workspaceId}', '${orderId}', '${materialType}', '${status}',
      CURRENT_TIMESTAMP(3)
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
