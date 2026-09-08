"use strict";

/**
 * Logika kopiowania dokumentacji produktowej (`docs/dokumentacja-produktowa.md`)
 * do artefaktu webowego (`apps/web/public/materials/docs/`), tym samym wzorcem
 * co logi warsztatowe (`workshop-logs-web-copy.cjs`): jedyne źródło prawdy
 * pozostaje w `docs/`, a build kopiuje je do statycznego assetu. Brak pliku
 * źródłowego jest błędem, który ma zatrzymać build.
 */

const { readFileSync, writeFileSync, mkdirSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const PRODUCT_DOCS_FILENAME = "dokumentacja-produktowa.md";

function copyProductDocsForWeb({ sourceDir, destDir }) {
  mkdirSync(destDir, { recursive: true });

  const sourcePath = join(sourceDir, PRODUCT_DOCS_FILENAME);
  if (!existsSync(sourcePath)) {
    throw new Error(
      `Brak wymaganej dokumentacji produktowej "${PRODUCT_DOCS_FILENAME}" w ${sourceDir}. Build zatrzymany.`
    );
  }

  writeFileSync(join(destDir, PRODUCT_DOCS_FILENAME), readFileSync(sourcePath));
  return PRODUCT_DOCS_FILENAME;
}

module.exports = { PRODUCT_DOCS_FILENAME, copyProductDocsForWeb };
