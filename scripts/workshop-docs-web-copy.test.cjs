"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { PRODUCT_DOCS_FILENAME, copyProductDocsForWeb } = require("./workshop-docs-web-copy.cjs");

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "workshop-docs-web-copy-"));
}

test("kopiuje dokumentację produktową do katalogu docelowego", () => {
  const sourceDir = makeTempDir();
  const destDir = join(makeTempDir(), "nested", "materials", "docs");
  try {
    writeFileSync(join(sourceDir, PRODUCT_DOCS_FILENAME), "# Dokumentacja\n\nTreść.\n");

    const copied = copyProductDocsForWeb({ sourceDir, destDir });

    assert.equal(copied, PRODUCT_DOCS_FILENAME);
    assert.equal(
      readFileSync(join(destDir, PRODUCT_DOCS_FILENAME), "utf8"),
      readFileSync(join(sourceDir, PRODUCT_DOCS_FILENAME), "utf8")
    );
    assert.deepEqual(readdirSync(destDir), [PRODUCT_DOCS_FILENAME]);
  } finally {
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(destDir, { recursive: true, force: true });
  }
});

test("rzuca błąd, gdy brakuje dokumentacji źródłowej", () => {
  const sourceDir = makeTempDir();
  const destDir = makeTempDir();
  try {
    assert.throws(
      () => copyProductDocsForWeb({ sourceDir, destDir }),
      new RegExp(PRODUCT_DOCS_FILENAME)
    );
  } finally {
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(destDir, { recursive: true, force: true });
  }
});
