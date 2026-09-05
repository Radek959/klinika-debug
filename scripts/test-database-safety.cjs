const { URL } = require("node:url");

function validateSafeTestDatabaseUrl({ databaseUrl, nodeEnv }) {
  if (nodeEnv !== "test") {
    return fail("NODE_ENV musi mieć wartość test.");
  }

  if (!databaseUrl) {
    return fail("TEST_DATABASE_URL musi wskazywać oddzielną testową bazę MySQL.");
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return fail("TEST_DATABASE_URL musi być poprawnym adresem bazy MySQL.");
  }

  if (!["mysql:", "mariadb:"].includes(parsed.protocol)) {
    return fail("TEST_DATABASE_URL musi używać protokołu mysql:// albo mariadb://.");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!databaseName.endsWith("_test")) {
    return fail("Nazwa testowej bazy danych musi kończyć się na _test.");
  }

  return { ok: true, databaseName };
}

function assertSafeTestDatabaseUrl({ databaseUrl, nodeEnv }) {
  const result = validateSafeTestDatabaseUrl({ databaseUrl, nodeEnv });
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result;
}

function fail(message) {
  return { ok: false, message };
}

module.exports = {
  assertSafeTestDatabaseUrl,
  validateSafeTestDatabaseUrl
};
