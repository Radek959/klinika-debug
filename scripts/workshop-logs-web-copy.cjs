"use strict";

/**
 * Logika kopiowania wybranych fixture'ów logów warsztatowych
 * (`workshop-assets/logs/`) do artefaktu webowego (`apps/web/public/materials/logs/`).
 *
 * Kopiowane są WYŁĄCZNIE pliki z jawnej whitelisty `ALLOWED_LOG_FILES` — nigdy
 * dowolne pliki `.log` znalezione w katalogu źródłowym. Brak wymaganego pliku
 * jest błędem, który ma zatrzymać build (`copyWorkshopLogsForWeb` rzuca
 * wyjątek), a nie po cichu pominięty materiał.
 */

const { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } = require("node:fs");
const { join } = require("node:path");

const ALLOWED_LOG_FILES = [
  "happy-path.log",
  "patient-error.log",
  "order-flow.log",
  "lab-timeout.log",
  "api-diagnostics.log",
  "correlation-trace.log",
  "production-like.log"
];

function copyWorkshopLogsForWeb({ sourceDir, destDir }) {
  mkdirSync(destDir, { recursive: true });

  for (const existingFile of readdirSync(destDir)) {
    if (existingFile.endsWith(".log")) {
      unlinkSync(join(destDir, existingFile));
    }
  }

  const copied = [];
  for (const fileName of ALLOWED_LOG_FILES) {
    const sourcePath = join(sourceDir, fileName);
    if (!existsSync(sourcePath)) {
      throw new Error(
        `Brak wymaganego materiału warsztatowego "${fileName}" w ${sourceDir}. Build zatrzymany.`
      );
    }
    writeFileSync(join(destDir, fileName), readFileSync(sourcePath));
    copied.push(fileName);
  }

  return copied;
}

module.exports = { ALLOWED_LOG_FILES, copyWorkshopLogsForWeb };
