const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { URL } = require("node:url");
const mariadb = require("mariadb");

const repoRoot = join(__dirname, "..");
const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  console.error("TEST_DATABASE_URL musi wskazywać oddzielną testową bazę MySQL.");
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
  await resetKnownTables();
  try {
    await applyMigration("20260904120000_init");
    await insertLegacyPatient();
    await applyMigration("20260905150000_extend_patients");
    await assertLegacyPatientBackfill();
    await assertGuardianWorkspaceConstraint();
  } finally {
    await resetKnownTables();
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

async function insertLegacyPatient() {
  await query(`
    INSERT INTO workspaces (id, name, slug, updatedAt)
    VALUES ('migration-workspace-a', 'Klinika Migracyjna A', 'migration-a', CURRENT_TIMESTAMP(3))
  `);

  await query(`
    INSERT INTO patients (
      id,
      workspaceId,
      firstName,
      lastName,
      identifierType,
      pesel,
      active,
      updatedAt
    )
    VALUES (
      'migration-patient-pesel',
      'migration-workspace-a',
      'Jan',
      'Migracyjny',
      'PESEL',
      '44051401458',
      true,
      CURRENT_TIMESTAMP(3)
    )
  `);
}

async function assertLegacyPatientBackfill() {
  const rows = await query(`
    SELECT DATE_FORMAT(birthDate, '%Y-%m-%d') AS birthDate, gender
    FROM patients
    WHERE id = 'migration-patient-pesel'
  `);

  const patient = rows[0];
  if (!patient) {
    throw new Error("Nie znaleziono pacjenta testującego migrację.");
  }

  if (patient.birthDate !== "1944-05-14" || patient.gender !== "MALE") {
    throw new Error(
      `Niepoprawny backfill PESEL: ${patient.birthDate}, ${patient.gender}.`
    );
  }
}

async function assertGuardianWorkspaceConstraint() {
  await query(`
    INSERT INTO workspaces (id, name, slug, updatedAt)
    VALUES ('migration-workspace-b', 'Klinika Migracyjna B', 'migration-b', CURRENT_TIMESTAMP(3))
  `);

  let failed = false;
  try {
    await query(`
      INSERT INTO guardians (
        id,
        workspaceId,
        patientId,
        firstName,
        lastName,
        updatedAt
      )
      VALUES (
        'migration-guardian-mismatch',
        'migration-workspace-b',
        'migration-patient-pesel',
        'Maria',
        'Migracyjna',
        CURRENT_TIMESTAMP(3)
      )
    `);
  } catch {
    failed = true;
  }

  if (!failed) {
    throw new Error(
      "Baza pozwoliła utworzyć opiekuna w innym workspace niż pacjent."
    );
  }
}

async function resetKnownTables() {
  await query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of [
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
    database: decodeURIComponent(parsed.pathname.replace(/^\/+/, ""))
  };
}
