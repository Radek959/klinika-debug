const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const [mode] = process.argv.slice(2);

if (!process.env.TEST_DATABASE_URL) {
  console.error("TEST_DATABASE_URL musi wskazywać oddzielną testową bazę MySQL.");
  process.exit(1);
}

const commands = {
  "jest-e2e": {
    executable: process.execPath,
    args: [
      join("..", "..", "node_modules", "jest", "bin", "jest.js"),
      "--config",
      join("test", "jest-e2e.json"),
      "--runInBand"
    ],
    cwd: join(process.cwd(), "apps", "api")
  },
  "prisma-migrate-deploy": [
    process.execPath,
    [join("node_modules", "prisma", "build", "index.js"), "migrate", "deploy"],
    process.cwd()
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
