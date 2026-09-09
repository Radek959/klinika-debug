#!/usr/bin/env node
"use strict";

/**
 * Uruchamia testy jednostkowe czystej logiki `tests/workshop-browser/support/env.ts`
 * (localhost guard, IPv6 handling) bez sieci i bez Playwrighta. Osobny
 * wrapper (analogiczny do `scripts/run-with-test-database.cjs`), żeby
 * przekazać `TS_NODE_PROJECT` cross-platform — inline `VAR=value` przed
 * komendą nie działa w cmd.exe/PowerShell.
 */

const { spawnSync } = require("node:child_process");
const { dirname, join } = require("node:path");

const repoRoot = dirname(__dirname);

const result = spawnSync(
  process.execPath,
  [
    "--require",
    "ts-node/register/transpile-only",
    "--test",
    join("tests", "workshop-browser", "support", "env.test.ts")
  ],
  {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      TS_NODE_PROJECT: join(repoRoot, "tests", "workshop-browser", "tsconfig.json")
    }
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
