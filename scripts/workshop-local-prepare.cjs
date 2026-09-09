#!/usr/bin/env node
"use strict";

/**
 * `npm run workshop:local:prepare` — przygotowuje lokalne środowisko do
 * `npm run test:workshop-browser` (Playwright) bez ręcznego generowania
 * hashy Argon2, seedowania `tester01`, zgadywania kolejności migracji ani
 * instalowania Chromium.
 *
 * Celowo MAŁA warstwa orkiestracji nad ISTNIEJĄCYMI mechanizmami — nie
 * duplikuje migration runnera ani provisioningu:
 *   A. waliduje wymagane lokalne env (i że hasło /admin pasuje do hasha);
 *   B. sprawdza połączenie z lokalnym MySQL (bez uruchamiania Dockera);
 *   C. `npm run db:generate` + `npm run db:migrate`;
 *   D. `npm run workshop:prepare` (istniejący provisioning `tester01`/`warsztat-01`);
 *   E. weryfikuje w bazie, że `tester01`/`warsztat-01` faktycznie istnieją;
 *   F. `npx playwright install chromium`.
 *
 * NIGDY nie dotyka zdalnej/publicznej bazy (patrz `workshop-local/config.cjs`)
 * i NIGDY nie uruchamia Dockera automatycznie.
 */

const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { URL } = require("node:url");
const mariadb = require("mariadb");
const {
  assertLocalDatabaseUrl,
  readWorkshopLocalPrepareConfig,
  verifyAdminCredentialsMatch
} = require("./workshop-local/config.cjs");

const repoRoot = join(__dirname, "..");

main().then(
  (exitCode) => process.exit(exitCode),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
);

async function main() {
  console.log("workshop:local:prepare");
  console.log("");

  let config;
  try {
    config = readWorkshopLocalPrepareConfig(process.env);
    assertLocalDatabaseUrl({ databaseUrl: config.databaseUrl, nodeEnv: process.env.NODE_ENV });
  } catch (error) {
    console.error(error.message);
    return 1;
  }
  console.log("[1/6] Konfiguracja env: OK");

  const credentialsMatch = await verifyAdminCredentialsMatch(config);
  if (!credentialsMatch) {
    console.error(
      "WORKSHOP_ADMIN_PASSWORD nie pasuje do ADMIN_PASSWORD_HASH — logowanie do lokalnego /admin nie zadziała. " +
        "Ustaw spójną parę (patrz .env.example) albo wygeneruj nowy hash: " +
        "node -e \"require('argon2').hash('TwojeHaslo').then(console.log)\""
    );
    return 1;
  }
  console.log("[2/6] Hasło /admin pasuje do ADMIN_PASSWORD_HASH: OK");

  const dbReachable = await checkMysqlConnection(config.databaseUrl);
  if (!dbReachable.ok) {
    console.error("Nie można połączyć się z lokalnym MySQL. Uruchom:");
    console.error("  docker compose up -d mysql");
    console.error(`Szczegóły: ${dbReachable.message}`);
    return 1;
  }
  console.log("[3/6] Połączenie z lokalnym MySQL: OK");

  if (!runNpmScript("db:generate") || !runNpmScript("db:migrate")) {
    console.error("Migracja lokalnej bazy nie powiodła się.");
    return 1;
  }
  console.log("[4/6] Prisma generate + migrate: OK");

  if (!runNpmScript("workshop:prepare")) {
    console.error("Provisioning workspace'ów warsztatowych nie powiódł się.");
    return 1;
  }

  const provisioned = await verifyTesterOneProvisioned(config.databaseUrl);
  if (!provisioned.ok) {
    console.error(`Weryfikacja provisioningu nie powiodła się: ${provisioned.message}`);
    return 1;
  }
  console.log("[5/6] tester01 / warsztat-01 (rola STAFF, aktywny): OK");

  if (!runCommand("npx", ["playwright", "install", "chromium"])) {
    console.error("Instalacja Chromium dla Playwrighta nie powiodła się.");
    return 1;
  }
  console.log("[6/6] Chromium dla Playwrighta: OK");

  console.log("");
  console.log("Lokalne środowisko jest gotowe. Kolejne kroki:");
  console.log("  npm run workshop:local:start   (Terminal 1)");
  console.log("  npm run verify:pr              (Terminal 2, po ustawieniu WORKSHOP_E2E_CONFIRM=RUN)");
  return 0;
}

async function checkMysqlConnection(databaseUrl) {
  let connection;
  try {
    connection = await mariadb.createConnection({
      ...parseDatabaseUrl(databaseUrl),
      connectTimeout: 5000
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describeConnectionError(error) };
  } finally {
    if (connection) {
      await connection.end().catch(() => undefined);
    }
  }
}

/**
 * `mariadb.createConnection` odrzuca `AggregateError`-em z pustym `.message`
 * przy zwykłym ECONNREFUSED (np. MySQL nie działa) — bez tego "Szczegóły:"
 * byłoby puste i bezużyteczne.
 */
function describeConnectionError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const code = "code" in error ? error.code : undefined;
  if (error.message) {
    return code ? `${error.message} (${code})` : error.message;
  }
  const nestedMessages = Array.isArray(error.errors)
    ? error.errors.map((nested) => nested.message).filter(Boolean)
    : [];
  return [code, ...nestedMessages].filter(Boolean).join(" ") || error.constructor.name;
}

async function verifyTesterOneProvisioned(databaseUrl) {
  let connection;
  try {
    connection = await mariadb.createConnection(parseDatabaseUrl(databaseUrl));
    const rows = await connection.query(
      `SELECT u.login, u.role, u.active, w.slug
       FROM users u
       JOIN workspaces w ON w.id = u.workspaceId
       WHERE u.login = 'tester01' AND w.slug = 'warsztat-01'
       LIMIT 1`
    );

    if (rows.length === 0) {
      return { ok: false, message: "Nie znaleziono użytkownika tester01 w workspace warsztat-01." };
    }

    const [row] = rows;
    if (row.role !== "STAFF") {
      return { ok: false, message: `tester01 ma nieoczekiwaną rolę: ${row.role}.` };
    }
    if (!row.active) {
      return { ok: false, message: "tester01 istnieje, ale nie jest aktywny." };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    if (connection) {
      await connection.end().catch(() => undefined);
    }
  }
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

function runNpmScript(scriptName) {
  return runCommand("npm", ["run", scriptName]);
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: true
  });
  return !result.error && result.status === 0;
}
