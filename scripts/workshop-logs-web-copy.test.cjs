"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { ALLOWED_LOG_FILES, copyWorkshopLogsForWeb } = require("./workshop-logs-web-copy.cjs");

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "workshop-logs-web-copy-"));
}

function writeAllowedFixtures(sourceDir, overrides = {}) {
  for (const fileName of ALLOWED_LOG_FILES) {
    const content = overrides[fileName] ?? `{"file":"${fileName}"}\n`;
    writeFileSync(join(sourceDir, fileName), content);
  }
}

test("kopiuje wszystkie pliki z whitelisty do katalogu docelowego", () => {
  const sourceDir = makeTempDir();
  const destDir = join(makeTempDir(), "nested", "materials", "logs");
  try {
    writeAllowedFixtures(sourceDir);

    const copied = copyWorkshopLogsForWeb({ sourceDir, destDir });

    assert.deepEqual(copied.sort(), [...ALLOWED_LOG_FILES].sort());
    for (const fileName of ALLOWED_LOG_FILES) {
      assert.equal(
        readFileSync(join(destDir, fileName), "utf8"),
        readFileSync(join(sourceDir, fileName), "utf8")
      );
    }
  } finally {
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(destDir, { recursive: true, force: true });
  }
});

test("nie kopiuje plików spoza whitelisty", () => {
  const sourceDir = makeTempDir();
  const destDir = makeTempDir();
  try {
    writeAllowedFixtures(sourceDir);
    writeFileSync(join(sourceDir, "not-approved.log"), "{}\n");
    writeFileSync(join(sourceDir, ".env"), "SECRET=1\n");

    copyWorkshopLogsForWeb({ sourceDir, destDir });

    const destFiles = readdirSync(destDir).sort();
    assert.deepEqual(destFiles, [...ALLOWED_LOG_FILES].sort());
  } finally {
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(destDir, { recursive: true, force: true });
  }
});

test("rzuca błąd i nie kopiuje niczego częściowo, gdy brakuje wymaganego pliku", () => {
  const sourceDir = makeTempDir();
  const destDir = makeTempDir();
  try {
    writeAllowedFixtures(sourceDir);
    rmSync(join(sourceDir, ALLOWED_LOG_FILES[ALLOWED_LOG_FILES.length - 1]));

    assert.throws(
      () => copyWorkshopLogsForWeb({ sourceDir, destDir }),
      new RegExp(ALLOWED_LOG_FILES[ALLOWED_LOG_FILES.length - 1])
    );
  } finally {
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(destDir, { recursive: true, force: true });
  }
});

test("czyści stare pliki .log w katalogu docelowym przed ponownym kopiowaniem", () => {
  const sourceDir = makeTempDir();
  const destDir = makeTempDir();
  try {
    writeFileSync(join(destDir, "stale-leftover.log"), "stara zawartość\n");
    writeAllowedFixtures(sourceDir);

    copyWorkshopLogsForWeb({ sourceDir, destDir });

    const destFiles = readdirSync(destDir).sort();
    assert.deepEqual(destFiles, [...ALLOWED_LOG_FILES].sort());
  } finally {
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(destDir, { recursive: true, force: true });
  }
});
