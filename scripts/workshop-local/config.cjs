"use strict";

const { URL } = require("node:url");
const argon2 = require("argon2");

/**
 * Konfiguracja i walidacja `npm run workshop:local:prepare` — WYŁĄCZNIE
 * czyste funkcje (bez sieci, bez Prisma), żeby dało się je testować
 * jednostkowo bez prawdziwej bazy. Orkiestrację (Prisma, MySQL, Playwright)
 * wykonuje `scripts/workshop-local-prepare.cjs`.
 */

const ALLOWED_LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Odmawia działania, jeżeli `NODE_ENV=production` albo `databaseUrl` nie
 * wskazuje na lokalny host — ten skrypt uruchamia migracje i seedy, więc
 * NIGDY nie może dotknąć zdalnej/produkcyjnej bazy.
 */
function assertLocalDatabaseUrl({ databaseUrl, nodeEnv }) {
  if (nodeEnv === "production") {
    throw new Error(
      "workshop:local:prepare odmawia działania przy NODE_ENV=production — ten skrypt jest wyłącznie do lokalnego developmentu."
    );
  }

  if (!databaseUrl || !databaseUrl.trim()) {
    throw new Error("DATABASE_URL jest wymagane.");
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(`DATABASE_URL nie jest poprawnym URL-em: "${databaseUrl}".`);
  }

  const normalizedHostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!ALLOWED_LOCAL_HOSTNAMES.has(normalizedHostname)) {
    throw new Error(
      "workshop:local:prepare może działać wyłącznie przeciwko lokalnej bazie danych (localhost/127.0.0.1/::1)."
    );
  }
}

/**
 * Wymagane zmienne środowiskowe do lokalnego przygotowania środowiska
 * warsztatowego. Zbiera WSZYSTKIE brakujące na raz (tak jak
 * `scripts/workshop-smoke/config.cjs`), żeby developer/agent nie musiał
 * poprawiać `.env` po jednej zmiennej na uruchomienie.
 */
function readWorkshopLocalPrepareConfig(env) {
  const errors = [];

  const databaseUrl = nonEmpty(env.DATABASE_URL);
  if (!databaseUrl) {
    errors.push("DATABASE_URL jest wymagane (lokalna baza MySQL, patrz .env.example).");
  }

  const workshopStaffPassword = nonEmpty(env.WORKSHOP_STAFF_PASSWORD);
  if (!workshopStaffPassword) {
    errors.push("WORKSHOP_STAFF_PASSWORD jest wymagane (hasło kont testerXX).");
  }

  const workshopAdminPassword = nonEmpty(env.WORKSHOP_ADMIN_PASSWORD);
  if (!workshopAdminPassword) {
    errors.push("WORKSHOP_ADMIN_PASSWORD jest wymagane (hasło panelu /admin).");
  }

  const adminPasswordHash = nonEmpty(env.ADMIN_PASSWORD_HASH);
  if (!adminPasswordHash) {
    errors.push("ADMIN_PASSWORD_HASH jest wymagane (hash argon2id hasła panelu /admin).");
  }

  const adminSessionSecret = nonEmpty(env.ADMIN_SESSION_SECRET);
  if (!adminSessionSecret) {
    errors.push("ADMIN_SESSION_SECRET jest wymagane.");
  }

  if (errors.length > 0) {
    throw new Error(`Nieprawidłowa konfiguracja workshop:local:prepare:\n- ${errors.join("\n- ")}`);
  }

  return {
    databaseUrl,
    workshopStaffPassword,
    workshopAdminPassword,
    adminPasswordHash,
    adminSessionSecret
  };
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Sprawdza, czy `WORKSHOP_ADMIN_PASSWORD` faktycznie pasuje do
 * `ADMIN_PASSWORD_HASH` — bez tego lokalne logowanie do `/admin` ciche by
 * się nie powiodło dopiero w trakcie Playwrighta. Nigdy nie loguje hasła ani
 * hasha; nieprawidłowy format hasha jest traktowany jak brak dopasowania
 * (nie jak awaria skryptu), tak samo jak w `AdminController`.
 */
async function verifyAdminCredentialsMatch({ adminPasswordHash, workshopAdminPassword }) {
  try {
    return await argon2.verify(adminPasswordHash, workshopAdminPassword);
  } catch {
    return false;
  }
}

module.exports = {
  assertLocalDatabaseUrl,
  readWorkshopLocalPrepareConfig,
  verifyAdminCredentialsMatch
};
