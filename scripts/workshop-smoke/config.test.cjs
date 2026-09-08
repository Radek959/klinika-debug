"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readWorkshopSmokeConfig } = require("./config.cjs");

const validEnv = {
  WORKSHOP_BASE_URL: "https://klinikadebug.rwasik.pl",
  WORKSHOP_STAFF_PASSWORD: "WarsztatTestowe123!",
  WORKSHOP_ADMIN_PASSWORD: "AdminTestowe123!"
};

test("akceptuje minimalną poprawną konfigurację i domyślnie NIE potwierdza zmian", () => {
  const config = readWorkshopSmokeConfig(validEnv);
  assert.equal(config.baseUrl, "https://klinikadebug.rwasik.pl");
  assert.equal(config.confirmed, false);
  assert.deepEqual(config.secrets, [validEnv.WORKSHOP_STAFF_PASSWORD, validEnv.WORKSHOP_ADMIN_PASSWORD]);
});

test("WORKSHOP_SMOKE_CONFIRM=RUN włącza pełny tryb", () => {
  const config = readWorkshopSmokeConfig({ ...validEnv, WORKSHOP_SMOKE_CONFIRM: "RUN" });
  assert.equal(config.confirmed, true);
});

test("każda inna wartość WORKSHOP_SMOKE_CONFIRM nie potwierdza zmian", () => {
  const config = readWorkshopSmokeConfig({ ...validEnv, WORKSHOP_SMOKE_CONFIRM: "yes" });
  assert.equal(config.confirmed, false);
});

test("wymaga WORKSHOP_BASE_URL", () => {
  assert.throws(
    () => readWorkshopSmokeConfig({ ...validEnv, WORKSHOP_BASE_URL: undefined }),
    /WORKSHOP_BASE_URL/
  );
});

test("odrzuca niepoprawny WORKSHOP_BASE_URL", () => {
  assert.throws(
    () => readWorkshopSmokeConfig({ ...validEnv, WORKSHOP_BASE_URL: "not-a-url" }),
    /WORKSHOP_BASE_URL/
  );
});

test("wymaga WORKSHOP_STAFF_PASSWORD i WORKSHOP_ADMIN_PASSWORD", () => {
  assert.throws(
    () => readWorkshopSmokeConfig({ ...validEnv, WORKSHOP_STAFF_PASSWORD: undefined }),
    /WORKSHOP_STAFF_PASSWORD/
  );
  assert.throws(
    () => readWorkshopSmokeConfig({ ...validEnv, WORKSHOP_ADMIN_PASSWORD: undefined }),
    /WORKSHOP_ADMIN_PASSWORD/
  );
});

test("odrzuca zbyt krótkie hasła", () => {
  assert.throws(
    () => readWorkshopSmokeConfig({ ...validEnv, WORKSHOP_STAFF_PASSWORD: "abc" }),
    /WORKSHOP_STAFF_PASSWORD musi mieć co najmniej/
  );
  assert.throws(
    () => readWorkshopSmokeConfig({ ...validEnv, WORKSHOP_ADMIN_PASSWORD: "abc" }),
    /WORKSHOP_ADMIN_PASSWORD musi mieć co najmniej/
  );
});

test("komunikat błędu nie zawiera wartości podanych sekretów", () => {
  try {
    readWorkshopSmokeConfig({ ...validEnv, WORKSHOP_BASE_URL: undefined });
    assert.fail("oczekiwano błędu");
  } catch (error) {
    assert.equal(error.message.includes(validEnv.WORKSHOP_STAFF_PASSWORD), false);
    assert.equal(error.message.includes(validEnv.WORKSHOP_ADMIN_PASSWORD), false);
  }
});

test("domyślne wartości limitów czasu i pollingu", () => {
  const config = readWorkshopSmokeConfig(validEnv);
  assert.equal(config.labTimeoutMs, 30000);
  assert.equal(config.pollIntervalMs, 1000);
  assert.equal(config.requestTimeoutMs, 15000);
});

test("pozwala nadpisać limity czasu przez env", () => {
  const config = readWorkshopSmokeConfig({
    ...validEnv,
    WORKSHOP_SMOKE_LAB_TIMEOUT_MS: "60000",
    WORKSHOP_SMOKE_POLL_INTERVAL_MS: "500"
  });
  assert.equal(config.labTimeoutMs, 60000);
  assert.equal(config.pollIntervalMs, 500);
});

test("odrzuca nieliczbowe albo niedodatnie limity czasu", () => {
  assert.throws(() =>
    readWorkshopSmokeConfig({ ...validEnv, WORKSHOP_SMOKE_LAB_TIMEOUT_MS: "abc" })
  );
  assert.throws(() =>
    readWorkshopSmokeConfig({ ...validEnv, WORKSHOP_SMOKE_LAB_TIMEOUT_MS: "0" })
  );
});
