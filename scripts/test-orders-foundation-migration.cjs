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
    await assertUpgradeMigrationAndConstraints();
  } finally {
    await resetKnownTables();
  }
}

async function assertEmptyDatabaseMigration() {
  await resetKnownTables();
  await applyMigration("20260904120000_init");
  await applyMigration("20260905150000_extend_patients");
  await applyMigration("20260906100000_orders_foundation");
  await assertNewTablesAndEnums();
}

async function assertUpgradeMigrationAndConstraints() {
  await resetKnownTables();
  await applyMigration("20260904120000_init");
  await applyMigration("20260905150000_extend_patients");
  await insertExistingData();
  await applyMigration("20260906100000_orders_foundation");

  await assertExistingDataPreserved();
  await assertNewTablesAndEnums();
  await assertOrderWorkspaceConstraints();
  await assertOrderTestConstraints();
  await assertSampleConstraints();
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
  await insertWorkspace("workspace-a", "Klinika Migracyjna A", "orders-a");
  await insertWorkspace("workspace-b", "Klinika Migracyjna B", "orders-b");
  await insertUser("user-a", "workspace-a", "orders.staff.a");
  await insertUser("user-b", "workspace-b", "orders.staff.b");
  await insertPatient("patient-a", "workspace-a", "Anna", "Migracyjna", "02270803624");
  await insertPatient("patient-b", "workspace-b", "Jan", "Migracyjny", "44051401458");
}

async function assertExistingDataPreserved() {
  const users = await query("SELECT COUNT(*) AS count FROM users");
  const patients = await query("SELECT COUNT(*) AS count FROM patients");
  if (Number(users[0].count) !== 2 || Number(patients[0].count) !== 2) {
    throw new Error("Migracja zleceń naruszyła istniejące konta lub pacjentów.");
  }
}

async function assertNewTablesAndEnums() {
  for (const table of [
    "medical_tests",
    "test_parameters",
    "medical_test_required_fields",
    "orders",
    "order_tests",
    "samples"
  ]) {
    const rows = await query(`SHOW TABLES LIKE '${table}'`);
    if (rows.length !== 1) {
      throw new Error(`Brakuje tabeli ${table}.`);
    }
  }

  await assertColumnTypeIncludes("orders", "status", "TECHNICAL_ERROR");
  await assertColumnTypeIncludes("orders", "priority", "URGENT");
  await assertColumnTypeIncludes("samples", "status", "ACCEPTED");
  await assertColumnTypeIncludes("samples", "materialType", "EDTA_BLOOD");
  await assertColumnTypeIncludes("test_parameters", "valueType", "NUMERIC");
  await assertColumnTypeIncludes(
    "medical_test_required_fields",
    "valueType",
    "BOOLEAN"
  );
}

async function assertOrderWorkspaceConstraints() {
  await expectConstraintFailure(`
    INSERT INTO orders (
      id, workspaceId, patientId, createdByUserId, priority, updatedAt
    )
    VALUES (
      'order-bad-patient', 'workspace-a', 'patient-b', 'user-a', 'ROUTINE', CURRENT_TIMESTAMP(3)
    )
  `, "Baza pozwoliła utworzyć zlecenie z pacjentem z innego workspace’u.");

  await expectConstraintFailure(`
    INSERT INTO orders (
      id, workspaceId, patientId, createdByUserId, priority, updatedAt
    )
    VALUES (
      'order-bad-user', 'workspace-a', 'patient-a', 'user-b', 'ROUTINE', CURRENT_TIMESTAMP(3)
    )
  `, "Baza pozwoliła utworzyć zlecenie z użytkownikiem z innego workspace’u.");

  await insertOrder("order-a", "workspace-a", "patient-a", "user-a");
  await insertOrder("order-a-2", "workspace-a", "patient-a", "user-a");
  await insertOrder("order-b", "workspace-b", "patient-b", "user-b");
}

async function assertOrderTestConstraints() {
  await insertMedicalTest("test-crp", "CRP", "SERUM");

  await expectConstraintFailure(`
    INSERT INTO order_tests (
      id, workspaceId, orderId, medicalTestId, updatedAt
    )
    VALUES (
      'order-test-bad-workspace', 'workspace-b', 'order-a', 'test-crp', CURRENT_TIMESTAMP(3)
    )
  `, "Baza pozwoliła przypisać badanie do zlecenia z innego workspace’u.");

  await query(`
    INSERT INTO order_tests (
      id, workspaceId, orderId, medicalTestId, updatedAt
    )
    VALUES (
      'order-test-crp', 'workspace-a', 'order-a', 'test-crp', CURRENT_TIMESTAMP(3)
    )
  `);

  await expectConstraintFailure(`
    INSERT INTO order_tests (
      id, workspaceId, orderId, medicalTestId, updatedAt
    )
    VALUES (
      'order-test-crp-duplicate', 'workspace-a', 'order-a', 'test-crp', CURRENT_TIMESTAMP(3)
    )
  `, "Baza pozwoliła dodać to samo badanie dwa razy do jednego zlecenia.");
}

async function assertSampleConstraints() {
  await expectConstraintFailure(`
    INSERT INTO samples (
      id, workspaceId, orderId, materialType, updatedAt
    )
    VALUES (
      'sample-bad-workspace', 'workspace-b', 'order-a', 'SERUM', CURRENT_TIMESTAMP(3)
    )
  `, "Baza pozwoliła przypisać próbkę do zlecenia z innego workspace’u.");

  await query(`
    INSERT INTO samples (
      id, workspaceId, orderId, materialType, updatedAt
    )
    VALUES (
      'sample-serum', 'workspace-a', 'order-a', 'SERUM', CURRENT_TIMESTAMP(3)
    )
  `);

  await expectConstraintFailure(`
    INSERT INTO samples (
      id, workspaceId, orderId, materialType, updatedAt
    )
    VALUES (
      'sample-serum-duplicate', 'workspace-a', 'order-a', 'SERUM', CURRENT_TIMESTAMP(3)
    )
  `, "Baza pozwoliła utworzyć dwie próbki tego samego materiału dla jednego zlecenia.");

  await query(`
    INSERT INTO samples (
      id, workspaceId, orderId, materialType, barcode, updatedAt
    )
    VALUES (
      'sample-urine', 'workspace-a', 'order-a', 'URINE', 'BARCODE-1', CURRENT_TIMESTAMP(3)
    )
  `);

  await expectConstraintFailure(`
    INSERT INTO samples (
      id, workspaceId, orderId, materialType, barcode, updatedAt
    )
    VALUES (
      'sample-barcode-duplicate', 'workspace-a', 'order-a-2', 'EDTA_BLOOD', 'BARCODE-1', CURRENT_TIMESTAMP(3)
    )
  `, "Baza pozwoliła powtórzyć kod kreskowy w tym samym workspace’u.");

  await query(`
    INSERT INTO samples (
      id, workspaceId, orderId, materialType, barcode, updatedAt
    )
    VALUES (
      'sample-same-barcode-other-workspace', 'workspace-b', 'order-b', 'SERUM', 'BARCODE-1', CURRENT_TIMESTAMP(3)
    )
  `);

  await query(`
    INSERT INTO samples (
      id, workspaceId, orderId, materialType, updatedAt
    )
    VALUES (
      'sample-null-barcode-a', 'workspace-a', 'order-a-2', 'SERUM', CURRENT_TIMESTAMP(3)
    )
  `);
  await query(`
    INSERT INTO samples (
      id, workspaceId, orderId, materialType, updatedAt
    )
    VALUES (
      'sample-null-barcode-b', 'workspace-b', 'order-b', 'URINE', CURRENT_TIMESTAMP(3)
    )
  `);

  await expectConstraintFailure(`
    INSERT INTO samples (
      id, workspaceId, orderId, materialType, collectedByUserId, updatedAt
    )
    VALUES (
      'sample-bad-collector', 'workspace-a', 'order-a-2', 'EDTA_BLOOD', 'user-b', CURRENT_TIMESTAMP(3)
    )
  `, "Baza pozwoliła przypisać pobierającego z innego workspace’u.");
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

async function insertOrder(id, workspaceId, patientId, userId) {
  await query(`
    INSERT INTO orders (
      id, workspaceId, patientId, createdByUserId, priority, updatedAt
    )
    VALUES (
      '${id}', '${workspaceId}', '${patientId}', '${userId}', 'ROUTINE', CURRENT_TIMESTAMP(3)
    )
  `);
}

async function insertMedicalTest(id, code, materialType) {
  await query(`
    INSERT INTO medical_tests (
      id, code, name, description, materialType, estimatedDurationMinutes, active, updatedAt
    )
    VALUES (
      '${id}', '${code}', '${code}', 'Syntetyczne badanie migracyjne.', '${materialType}', 5, true, CURRENT_TIMESTAMP(3)
    )
  `);
}

async function resetKnownTables() {
  await query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of [
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
