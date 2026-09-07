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
  "20260907210000_lab_order_rejected"
];
const SEND_RETRY_MIGRATION = "20260907230000_lab_send_retry";

// Wartości enumu order_history.eventType sprzed migracji. Żadna nie może zniknąć —
// migracja jest wyłącznie addytywna.
const EVENT_TYPES_BEFORE = [
  "ORDER_CREATED",
  "ORDER_UPDATED",
  "SAMPLE_REGISTERED",
  "ORDER_SENT_TO_LAB",
  "LAB_ORDER_ACCEPTED",
  "LAB_RESULT_RECEIVED",
  "LAB_SAMPLE_REJECTED",
  "LAB_ORDER_REJECTED",
  "TECHNICAL_ERROR"
];

const NEW_EVENT_TYPES = ["LAB_RATE_LIMIT_RECEIVED", "LAB_SEND_RETRY"];

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
    await assertUpgradeMigrationPreservesExistingData();
  } finally {
    await resetKnownTables();
  }
}

async function assertEmptyDatabaseMigration() {
  await resetKnownTables();
  for (const migration of MIGRATIONS_BEFORE) {
    await applyMigration(migration);
  }
  await applyMigration(SEND_RETRY_MIGRATION);

  await assertSendRetryTableShape();
  await assertSendRetryEnumValues();

  const jobs = await query("SELECT COUNT(*) AS count FROM lab_send_retry_jobs");
  if (Number(jobs[0].count) !== 0) {
    throw new Error("Pusta baza nie powinna zawierać zadań ponowienia po migracji.");
  }
}

async function assertUpgradeMigrationPreservesExistingData() {
  await resetKnownTables();
  for (const migration of MIGRATIONS_BEFORE) {
    await applyMigration(migration);
  }
  await insertExistingData();

  const ordersBefore = await readOrders();
  const historyBefore = await query("SELECT COUNT(*) AS count FROM order_history");
  const labJobsBefore = await query("SELECT COUNT(*) AS count FROM lab_jobs");
  const keysBefore = await query("SELECT COUNT(*) AS count FROM idempotency_keys");

  await applyMigration(SEND_RETRY_MIGRATION);

  await assertSendRetryTableShape();
  await assertSendRetryEnumValues();
  await assertExistingDataPreserved(
    ordersBefore,
    Number(historyBefore[0].count),
    Number(labJobsBefore[0].count),
    Number(keysBefore[0].count)
  );
  await assertRetryJobCanBeCreated();
  await assertOnlyOneActiveRetryJobPerOrder();
  await assertWorkspaceIsolationIsPossible();
  await assertNewEnumValuesAreUsable();
  await assertUnknownEnumValuesAreRejected();
}

async function assertSendRetryTableShape() {
  for (const column of [
    "id",
    "workspaceId",
    "orderId",
    "attemptNumber",
    "executeAt",
    "status",
    "correlationId",
    "scenario",
    "idempotencyKey",
    "requestHash",
    "attempts",
    "lockedAt",
    "lastError",
    "createdAt",
    "updatedAt"
  ]) {
    await assertColumnExists("lab_send_retry_jobs", column);
  }

  // Tabela nie może przechowywać danych pacjenta ani kodów kreskowych.
  for (const forbidden of ["pesel", "barcode", "patientId", "payload", "stackTrace"]) {
    const rows = await query(
      `SHOW COLUMNS FROM lab_send_retry_jobs LIKE '${forbidden}'`
    );
    if (rows.length !== 0) {
      throw new Error(
        `Tabela lab_send_retry_jobs nie może zawierać kolumny ${forbidden}.`
      );
    }
  }

  await assertColumnTypeIncludes("lab_send_retry_jobs", "status", "PENDING");
  await assertColumnTypeIncludes("lab_send_retry_jobs", "status", "PROCESSING");
  await assertColumnTypeIncludes("lab_send_retry_jobs", "status", "DONE");
  await assertColumnTypeIncludes("lab_send_retry_jobs", "status", "FAILED");

  // Indeks schedulera (status + executeAt) i indeks izolacji workspace'u.
  await assertIndexExists("lab_send_retry_jobs", "lab_send_retry_jobs_status_execute_at_idx");
  await assertIndexExists("lab_send_retry_jobs", "lab_send_retry_jobs_workspace_order_idx");
  await assertIndexExists("lab_send_retry_jobs", "lab_send_retry_jobs_workspace_order_key");

  const uniqueIndex = await query(
    "SHOW INDEX FROM lab_send_retry_jobs WHERE Key_name = 'lab_send_retry_jobs_workspace_order_key'"
  );
  if (uniqueIndex.length === 0 || Number(uniqueIndex[0].Non_unique) !== 0) {
    throw new Error(
      "Ograniczenie lab_send_retry_jobs_workspace_order_key musi być unikalne."
    );
  }
}

async function assertSendRetryEnumValues() {
  for (const eventType of [...EVENT_TYPES_BEFORE, ...NEW_EVENT_TYPES]) {
    await assertColumnTypeIncludes("order_history", "eventType", eventType);
  }

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

  // Migracja nie dotyka enumów zmienionych wcześniejszymi migracjami.
  await assertColumnTypeIncludes("order_tests", "status", "REJECTED");
  await assertColumnTypeIncludes("lab_jobs", "status", "PENDING");
}

async function assertExistingDataPreserved(
  ordersBefore,
  historyCountBefore,
  labJobsCountBefore,
  keysCountBefore
) {
  const ordersAfter = await readOrders();
  if (JSON.stringify(ordersBefore) !== JSON.stringify(ordersAfter)) {
    throw new Error(
      "Migracja zmieniła istniejące zlecenia — migracja musi być addytywna."
    );
  }

  const history = await query("SELECT COUNT(*) AS count FROM order_history");
  const labJobs = await query("SELECT COUNT(*) AS count FROM lab_jobs");
  const keys = await query("SELECT COUNT(*) AS count FROM idempotency_keys");
  if (
    Number(history[0].count) !== historyCountBefore ||
    Number(labJobs[0].count) !== labJobsCountBefore ||
    Number(keys[0].count) !== keysCountBefore
  ) {
    throw new Error(
      "Migracja naruszyła istniejącą historię, zadania lab_jobs albo klucze idempotencji."
    );
  }

  const existing = await query(
    "SELECT eventType FROM order_history WHERE id = 'history-existing-1'"
  );
  if (existing.length !== 1 || existing[0].eventType !== "ORDER_CREATED") {
    throw new Error("Migracja naruszyła typ zdarzenia istniejącego wpisu historii.");
  }

  const rejected = await query(
    "SELECT eventType FROM order_history WHERE id = 'history-existing-2'"
  );
  if (rejected.length !== 1 || rejected[0].eventType !== "LAB_ORDER_REJECTED") {
    throw new Error(
      "Migracja naruszyła wpis historii zapisany wcześniejszą wartością enumu."
    );
  }

  const key = await query(
    "SELECT responseStatus FROM idempotency_keys WHERE id = 'key-existing-1'"
  );
  if (key.length !== 1 || Number(key[0].responseStatus) !== 200) {
    throw new Error("Migracja naruszyła istniejący klucz idempotencji.");
  }
}

async function assertRetryJobCanBeCreated() {
  await insertRetryJob("retry-a", "workspace-a", "order-a");

  const rows = await query(
    "SELECT status, attemptNumber, attempts, scenario, correlationId FROM lab_send_retry_jobs WHERE id = 'retry-a'"
  );
  if (rows.length !== 1) {
    throw new Error("Po migracji nie da się utworzyć zadania ponowienia wysyłki.");
  }
  if (rows[0].status !== "PENDING") {
    throw new Error("Nowe zadanie ponowienia musi mieć domyślny status PENDING.");
  }
  if (Number(rows[0].attempts) !== 0) {
    throw new Error("Nowe zadanie ponowienia musi mieć domyślnie zero wykonań.");
  }
  if (Number(rows[0].attemptNumber) !== 2) {
    throw new Error("Zadanie ponowienia musi zapamiętać numer kolejnej próby.");
  }
  if (rows[0].scenario !== "RATE_LIMIT") {
    throw new Error("Zadanie ponowienia musi utrwalić scenariusz w chwili powstania.");
  }
  if (rows[0].correlationId !== "corr-retry-a") {
    throw new Error("Zadanie ponowienia musi zachować correlationId pierwotnej wysyłki.");
  }

  // Zadanie odwołujące się do nieistniejącego zlecenia musi zostać odrzucone.
  await expectConstraintFailure(
    buildRetryJobInsert("retry-broken", "workspace-a", "order-nie-istnieje"),
    "Baza przyjęła zadanie ponowienia dla nieistniejącego zlecenia."
  );
}

async function assertOnlyOneActiveRetryJobPerOrder() {
  // Jedno zlecenie może mieć dokładnie jedno zadanie ponowienia.
  await expectConstraintFailure(
    buildRetryJobInsert("retry-duplicate", "workspace-a", "order-a"),
    "Baza przyjęła drugie zadanie ponowienia dla tego samego zlecenia."
  );
}

async function assertWorkspaceIsolationIsPossible() {
  // Inne zlecenie w innym workspace może mieć własne zadanie.
  await insertRetryJob("retry-b", "workspace-b", "order-b");

  const rows = await query(
    "SELECT workspaceId FROM lab_send_retry_jobs WHERE workspaceId = 'workspace-b'"
  );
  if (rows.length !== 1) {
    throw new Error("Zadania ponowienia muszą dać się filtrować po workspaceId.");
  }

  // Zadanie z workspace'em niezgodnym ze zleceniem jest odrzucane przez klucz obcy.
  await expectConstraintFailure(
    buildRetryJobInsert("retry-cross", "workspace-b", "order-a"),
    "Baza przyjęła zadanie ponowienia łamiące izolację workspace'u."
  );
}

async function assertNewEnumValuesAreUsable() {
  for (const [index, eventType] of NEW_EVENT_TYPES.entries()) {
    const id = `history-new-${index}`;
    await query(`
      INSERT INTO order_history (
        id, workspaceId, orderId, eventType, actorType, correlationId, occurredAt,
        previousStatus, newStatus, details
      )
      VALUES (
        '${id}', 'workspace-a', 'order-a', '${eventType}', 'SYSTEM',
        'corr-retry-a', CURRENT_TIMESTAMP(3), 'SAMPLE_COLLECTED', 'SAMPLE_COLLECTED',
        '{"attemptNumber":1}'
      )
    `);
    const rows = await query(
      `SELECT eventType FROM order_history WHERE id = '${id}'`
    );
    if (rows[0].eventType !== eventType) {
      throw new Error(`Po migracji nie da się zapisać zdarzenia ${eventType}.`);
    }
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

async function assertUnknownEnumValuesAreRejected() {
  await expectConstraintFailure(
    "INSERT INTO order_history (id, workspaceId, orderId, eventType, actorType, occurredAt, details) VALUES ('history-bad-enum', 'workspace-a', 'order-a', 'NOT_AN_EVENT', 'LAB', CURRENT_TIMESTAMP(3), '{}')",
    "Baza przyjęła nieznaną wartość enumu order_history.eventType."
  );

  // Zwalniamy wiersz dla order-b, żeby poniższy INSERT mógł paść wyłącznie na
  // nieprawidłowej wartości enumu, a nie na ograniczeniu unikalności.
  await query("DELETE FROM lab_send_retry_jobs WHERE id = 'retry-b'");
  await expectConstraintFailure(
    `INSERT INTO lab_send_retry_jobs (
      id, workspaceId, orderId, attemptNumber, executeAt, status, correlationId,
      scenario, idempotencyKey, requestHash, updatedAt
    ) VALUES (
      'retry-bad-status', 'workspace-b', 'order-b', 2, CURRENT_TIMESTAMP(3), 'NOT_A_STATUS',
      'corr-x', 'RATE_LIMIT', 'send-order-b', 'hash-b', CURRENT_TIMESTAMP(3)
    )`,
    "Baza przyjęła nieznaną wartość enumu lab_send_retry_jobs.status."
  );
}

function buildRetryJobInsert(id, workspaceId, orderId) {
  return `
    INSERT INTO lab_send_retry_jobs (
      id, workspaceId, orderId, attemptNumber, executeAt, status, correlationId,
      scenario, idempotencyKey, requestHash, updatedAt
    )
    VALUES (
      '${id}', '${workspaceId}', '${orderId}', 2, CURRENT_TIMESTAMP(3), 'PENDING',
      'corr-${id}', 'RATE_LIMIT', 'send-${orderId}', 'hash-${orderId}', CURRENT_TIMESTAMP(3)
    )
  `;
}

async function insertRetryJob(id, workspaceId, orderId) {
  await query(buildRetryJobInsert(id, workspaceId, orderId));
}

async function readOrders() {
  return query("SELECT id, status, externalOrderId FROM orders ORDER BY id");
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
  await insertWorkspace("workspace-a", "Klinika Limitów A", "rate-limit-a");
  await insertWorkspace("workspace-b", "Klinika Limitów B", "rate-limit-b");
  await insertUser("user-a", "workspace-a", "limit.staff.a");
  await insertUser("user-b", "workspace-b", "limit.staff.b");
  await insertPatient("patient-a", "workspace-a", "Anna", "Limitowa", "02270803624");
  await insertPatient("patient-b", "workspace-b", "Jan", "Limitowy", "44051401458");
  await insertOrder("order-a", "workspace-a", "patient-a", "user-a", "SAMPLE_COLLECTED");
  await insertOrder("order-b", "workspace-b", "patient-b", "user-b", "SENT_TO_LAB");
  await insertMedicalTest("test-crp", "CRP", "SERUM");
  await insertOrderTest("order-test-a", "workspace-a", "order-a", "test-crp", "PENDING");
  await insertSample("sample-a", "workspace-a", "order-a", "SERUM", "COLLECTED");

  // Istniejące zadanie callbacka i klucz idempotencji nie mogą ucierpieć.
  await query(`
    INSERT INTO lab_jobs (
      id, workspaceId, orderId, scenario, payload, executeAt, status, updatedAt
    )
    VALUES (
      'lab-job-existing-1', 'workspace-b', 'order-b', 'SUCCESS', '{"status":"COMPLETED"}',
      CURRENT_TIMESTAMP(3), 'PENDING', CURRENT_TIMESTAMP(3)
    )
  `);
  await query(`
    INSERT INTO idempotency_keys (
      id, workspaceId, orderId, \`key\`, requestHash, responseStatus, responseBody
    )
    VALUES (
      'key-existing-1', 'workspace-b', 'order-b', 'send-order-b-existing', 'hash-existing',
      200, '{"externalOrderId":"EXT-existing"}'
    )
  `);
  await query(`
    INSERT INTO order_history (
      id, workspaceId, orderId, eventType, actorType, actorUserId, occurredAt, details
    )
    VALUES (
      'history-existing-1', 'workspace-a', 'order-a', 'ORDER_CREATED', 'STAFF', 'user-a',
      CURRENT_TIMESTAMP(3), '{}'
    )
  `);
  // Wpis zapisany ostatnią wartością enumu dodaną przed tą migracją.
  await query(`
    INSERT INTO order_history (
      id, workspaceId, orderId, eventType, actorType, occurredAt, details
    )
    VALUES (
      'history-existing-2', 'workspace-a', 'order-a', 'LAB_ORDER_REJECTED', 'LAB',
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

async function assertIndexExists(table, indexName) {
  const rows = await query(`SHOW INDEX FROM ${table} WHERE Key_name = '${indexName}'`);
  if (rows.length === 0) {
    throw new Error(`Brakuje indeksu ${indexName} w tabeli ${table}.`);
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
