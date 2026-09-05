const assert = require("node:assert/strict");
const {
  validateSafeTestDatabaseUrl
} = require("./test-database-safety.cjs");

const allowed = validateSafeTestDatabaseUrl({
  databaseUrl: "mysql://klinika:local-password@127.0.0.1:3307/klinika_debug_test",
  nodeEnv: "test"
});
assert.equal(allowed.ok, true);
assert.equal(allowed.databaseName, "klinika_debug_test");

const productionLikeDatabase = validateSafeTestDatabaseUrl({
  databaseUrl: "mysql://klinika:local-password@127.0.0.1:3307/klinika_debug",
  nodeEnv: "test"
});
assert.equal(productionLikeDatabase.ok, false);
assert.match(productionLikeDatabase.message, /_test/);
assert.doesNotMatch(productionLikeDatabase.message, /local-password/);

const missingTestEnv = validateSafeTestDatabaseUrl({
  databaseUrl: "mysql://klinika:local-password@127.0.0.1:3307/klinika_debug_test",
  nodeEnv: "development"
});
assert.equal(missingTestEnv.ok, false);
assert.match(missingTestEnv.message, /NODE_ENV/);
assert.doesNotMatch(missingTestEnv.message, /local-password/);

const invalidProtocol = validateSafeTestDatabaseUrl({
  databaseUrl: "postgresql://klinika:local-password@127.0.0.1:5432/klinika_debug_test",
  nodeEnv: "test"
});
assert.equal(invalidProtocol.ok, false);
assert.match(invalidProtocol.message, /mysql:\/\/ albo mariadb:\/\//);
assert.doesNotMatch(invalidProtocol.message, /local-password/);
