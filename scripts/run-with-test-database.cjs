const { spawnSync } = require("node:child_process");
const { dirname, join } = require("node:path");
const {
  assertSafeTestDatabaseUrl
} = require("./test-database-safety.cjs");

const repoRoot = dirname(__dirname);

const [mode] = process.argv.slice(2);

try {
  assertSafeTestDatabaseUrl({
    databaseUrl: process.env.TEST_DATABASE_URL,
    nodeEnv: process.env.NODE_ENV
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const commands = {
  "jest-e2e": {
    executable: process.execPath,
    args: [
      join("..", "..", "node_modules", "jest", "bin", "jest.js"),
      "--config",
      join("test", "jest-e2e.json"),
      "--runInBand",
      "--testTimeout=30000",
      "--verbose",
      "--forceExit"
    ],
    cwd: join(repoRoot, "apps", "api")
  },
  "prisma-migrate-deploy": [
    process.execPath,
    [join("node_modules", "prisma", "build", "index.js"), "migrate", "deploy"],
    repoRoot
  ]
};

const command = commands[mode];

if (!command) {
  console.error("Nieznany tryb testowej bazy.");
  process.exit(1);
}

const [executable, args, cwd] = Array.isArray(command)
  ? command
  : [command.executable, command.args, command.cwd];
const result = spawnSync(executable, args, {
  cwd,
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: process.env.TEST_DATABASE_URL
  }
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
