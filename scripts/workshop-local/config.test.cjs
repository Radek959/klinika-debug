"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const argon2 = require("argon2");
const {
  assertLocalDatabaseUrl,
  readWorkshopLocalPrepareConfig,
  verifyAdminCredentialsMatch
} = require("./config.cjs");

test("assertLocalDatabaseUrl odrzuca NODE_ENV=production", () => {
  assert.throws(
    () =>
      assertLocalDatabaseUrl({
        databaseUrl: "mysql://klinika:pw@localhost:3306/klinika_debug",
        nodeEnv: "production"
      }),
    /NODE_ENV=production/
  );
});

test("assertLocalDatabaseUrl odrzuca zdalny/publiczny host", () => {
  assert.throws(
    () =>
      assertLocalDatabaseUrl({
        databaseUrl: "mysql://klinika:pw@db.example.com:3306/klinika_debug",
        nodeEnv: "development"
      }),
    /wyłącznie przeciwko lokalnej bazie/
  );
});

test("assertLocalDatabaseUrl akceptuje localhost", () => {
  assert.doesNotThrow(() =>
    assertLocalDatabaseUrl({
      databaseUrl: "mysql://klinika:pw@localhost:3306/klinika_debug",
      nodeEnv: "development"
    })
  );
});

test("assertLocalDatabaseUrl akceptuje 127.0.0.1", () => {
  assert.doesNotThrow(() =>
    assertLocalDatabaseUrl({
      databaseUrl: "mysql://klinika:pw@127.0.0.1:3306/klinika_debug",
      nodeEnv: "development"
    })
  );
});

test("assertLocalDatabaseUrl akceptuje IPv6 localhost [::1]", () => {
  assert.doesNotThrow(() =>
    assertLocalDatabaseUrl({
      databaseUrl: "mysql://klinika:pw@[::1]:3306/klinika_debug",
      nodeEnv: "development"
    })
  );
});

test("assertLocalDatabaseUrl daje czytelny błąd dla brakującego DATABASE_URL", () => {
  assert.throws(
    () => assertLocalDatabaseUrl({ databaseUrl: undefined, nodeEnv: "development" }),
    /DATABASE_URL jest wymagane/
  );
});

test("assertLocalDatabaseUrl daje czytelny błąd dla niepoprawnego URL-a", () => {
  assert.throws(
    () => assertLocalDatabaseUrl({ databaseUrl: "not-a-url", nodeEnv: "development" }),
    /nie jest poprawnym URL-em/
  );
});

test("readWorkshopLocalPrepareConfig zbiera wszystkie brakujące zmienne na raz", () => {
  assert.throws(() => readWorkshopLocalPrepareConfig({}), (error) => {
    assert.match(error.message, /DATABASE_URL/);
    assert.match(error.message, /WORKSHOP_STAFF_PASSWORD/);
    assert.match(error.message, /WORKSHOP_ADMIN_PASSWORD/);
    assert.match(error.message, /ADMIN_PASSWORD_HASH/);
    assert.match(error.message, /ADMIN_SESSION_SECRET/);
    return true;
  });
});

test("readWorkshopLocalPrepareConfig akceptuje kompletną, poprawną konfigurację", () => {
  const config = readWorkshopLocalPrepareConfig({
    DATABASE_URL: "mysql://klinika:pw@localhost:3306/klinika_debug",
    WORKSHOP_STAFF_PASSWORD: "WarsztatTestowe123!",
    WORKSHOP_ADMIN_PASSWORD: "AdminWarsztat123!",
    ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=65536,t=3,p=4$abc$def",
    ADMIN_SESSION_SECRET: "local-development-admin-session-secret"
  });

  assert.equal(config.databaseUrl, "mysql://klinika:pw@localhost:3306/klinika_debug");
  assert.equal(config.workshopAdminPassword, "AdminWarsztat123!");
});

test("verifyAdminCredentialsMatch zwraca true, gdy hasło pasuje do hasha", async () => {
  const password = "AdminWarsztat123!";
  const hash = await argon2.hash(password, { type: argon2.argon2id });

  const matches = await verifyAdminCredentialsMatch({
    adminPasswordHash: hash,
    workshopAdminPassword: password
  });

  assert.equal(matches, true);
});

test("verifyAdminCredentialsMatch zwraca false, gdy hasło NIE pasuje do hasha", async () => {
  const hash = await argon2.hash("AdminWarsztat123!", { type: argon2.argon2id });

  const matches = await verifyAdminCredentialsMatch({
    adminPasswordHash: hash,
    workshopAdminPassword: "InneHaslo123!"
  });

  assert.equal(matches, false);
});

test("verifyAdminCredentialsMatch zwraca false (nie rzuca) dla niepoprawnego formatu hasha", async () => {
  const matches = await verifyAdminCredentialsMatch({
    adminPasswordHash: "local-development-admin-hash-placeholder",
    workshopAdminPassword: "AdminWarsztat123!"
  });

  assert.equal(matches, false);
});

test(".env.example ma DZIAŁAJĄCĄ lokalną parę WORKSHOP_ADMIN_PASSWORD/ADMIN_PASSWORD_HASH", async () => {
  const { readFileSync } = require("node:fs");
  const { join } = require("node:path");
  const dotenv = require("dotenv");

  const parsed = dotenv.parse(readFileSync(join(__dirname, "..", "..", ".env.example")));

  const matches = await verifyAdminCredentialsMatch({
    adminPasswordHash: parsed.ADMIN_PASSWORD_HASH,
    workshopAdminPassword: parsed.WORKSHOP_ADMIN_PASSWORD
  });

  assert.equal(
    matches,
    true,
    "WORKSHOP_ADMIN_PASSWORD i ADMIN_PASSWORD_HASH w .env.example muszą być spójną parą — inaczej lokalne logowanie do /admin po skopiowaniu .env.example nie zadziała."
  );
});
