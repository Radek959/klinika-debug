#!/usr/bin/env node
"use strict";

/**
 * Automatyczny walidator syntetycznych fixture'ów logów warsztatowych
 * (`workshop-assets/logs/`). Uruchamiany jako część zwykłego zestawu testów
 * (`npm test` → `test:workshop-logs`) i w CI (`.github/workflows/ci.yml`).
 *
 * Sprawdza: poprawność JSONL, minimalną liczbę wpisów na plik, obecność
 * wielu correlationId i wielu poziomów logowania, realistyczne znaczniki
 * czasu, wymagane kody statusu per scenariusz, harmonogram retry 15/30/60 s
 * w `lab-timeout.log`, brak sekretów/PESEL-i/tokenów oraz brak nazw
 * kontrolowanych błędów i znaczników w stylu `ROOT_CAUSE`.
 */

const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const LOGS_DIR = join(__dirname, "..", "workshop-assets", "logs");

const MIN_ENTRIES = {
  "happy-path.log": 80,
  "patient-error.log": 120,
  "order-flow.log": 120,
  "lab-timeout.log": 150,
  "api-diagnostics.log": 150,
  "correlation-trace.log": 180,
  "production-like.log": 400
};

const MAX_ENTRIES = {
  "production-like.log": 700
};

const REQUIRED_STATUS_CODES = {
  "happy-path.log": [200, 201],
  "patient-error.log": [201, 422],
  "order-flow.log": [200, 422],
  "lab-timeout.log": [504],
  "api-diagnostics.log": [200, 500],
  "correlation-trace.log": [200, 201],
  "production-like.log": [200, 201, 422, 429, 503]
};

const CONTROLLED_BUG_NAMES = ["PATIENT_GUARDIAN", "ORDER_FLOW", "API_DIAGNOSTICS"];
const ROOT_CAUSE_MARKER_PATTERN = /ROOT[_\s-]?CAUSE/i;

// Sekrety/dane wrażliwe, których fixture'y NIGDY nie mogą zawierać. To są
// dosłowne wartości placeholderów z .env.example — jeżeli którakolwiek z
// nich pojawi się w logu, to na pewno wyciek, a nie przypadek.
const FORBIDDEN_SECRET_VALUES = [
  "local-development-admin-hash-placeholder",
  "local-development-admin-session-secret",
  "local-development-lab-outbound-secret",
  "local-development-lab-webhook-secret",
  "local-development-pepper-change-me",
  "HasloTestowe123!",
  "WarsztatTestowe123!",
  "AdminPanelTest123!"
];

// Prawdziwe numery PESEL używane w testach/seedach repozytorium — fixture'y
// logów nie powinny zawierać ŻADNEGO numeru PESEL, ale w szczególności nie
// tych już znanych z kodu.
const KNOWN_TEST_PESELS = [
  "44051401458",
  "18210112349",
  "89112302659",
  "02270803624"
];

const PESEL_LIKE_PATTERN = /"pesel"\s*:\s*"\d{11}"/i;

let failures = 0;
let totalEntries = 0;

for (const fileName of Object.keys(MIN_ENTRIES)) {
  validateFile(fileName);
}

validateReadme();

if (failures > 0) {
  console.error(`\nWalidacja fixture'ów logów nie powiodła się (${failures} problem(ów)).`);
  process.exit(1);
}

console.log(`Fixture'y logów warsztatowych są poprawne (${totalEntries} wpisów łącznie w ${Object.keys(MIN_ENTRIES).length} plikach).`);

function validateFile(fileName) {
  const filePath = join(LOGS_DIR, fileName);
  if (!existsSync(filePath)) {
    fail(`${fileName}: plik nie istnieje.`);
    return;
  }

  const raw = readFileSync(filePath, "utf8");
  const rawLines = raw.split("\n");
  // Plik musi kończyć się dokładnie jednym znakiem nowej linii (jedna pusta
  // "linia" po podziale na końcu jest oczekiwana i pomijana).
  if (rawLines[rawLines.length - 1] !== "") {
    fail(`${fileName}: plik powinien kończyć się znakiem nowej linii.`);
  }
  const lines = rawLines.filter((line) => line.length > 0);

  const entries = [];
  lines.forEach((line, index) => {
    try {
      entries.push(JSON.parse(line));
    } catch (error) {
      fail(`${fileName}:${index + 1}: nieprawidłowy JSON (${error.message}).`);
    }
  });

  totalEntries += entries.length;

  const min = MIN_ENTRIES[fileName];
  if (entries.length < min) {
    fail(`${fileName}: ma ${entries.length} wpisów, wymagane co najmniej ${min}.`);
  }
  const max = MAX_ENTRIES[fileName];
  if (max && entries.length > max) {
    fail(`${fileName}: ma ${entries.length} wpisów, dozwolone maksymalnie ${max}.`);
  }

  const levels = new Set();
  const correlationIds = new Set();
  const statuses = new Set();
  let previousTimestampMs = -Infinity;
  let outOfOrderCount = 0;

  for (const entry of entries) {
    if (typeof entry.timestamp !== "string" || Number.isNaN(Date.parse(entry.timestamp))) {
      fail(`${fileName}: wpis ma nieprawidłowy lub brakujący 'timestamp'.`);
      continue;
    }
    const ts = Date.parse(entry.timestamp);
    if (ts < previousTimestampMs) {
      outOfOrderCount += 1;
    }
    previousTimestampMs = Math.max(previousTimestampMs, ts);

    if (!entry.level) {
      fail(`${fileName}: wpis nie ma pola 'level'.`);
    } else {
      levels.add(entry.level);
    }

    if (!entry.correlationId) {
      fail(`${fileName}: wpis nie ma pola 'correlationId'.`);
    } else {
      correlationIds.add(entry.correlationId);
    }

    if (typeof entry.status === "number") {
      statuses.add(entry.status);
    }
  }

  // Przeplot niezależnych requestów może dawać lokalne "cofnięcia" czasu przy
  // bardzo bliskich znacznikach, ale materiał jako całość ma być
  // chronologicznie realistyczny — dopuszczamy niewielki odsetek.
  if (outOfOrderCount > entries.length * 0.05) {
    fail(
      `${fileName}: zbyt wiele wpisów poza kolejnością chronologiczną (${outOfOrderCount}/${entries.length}).`
    );
  }

  const REQUIRED_LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"];
  for (const level of REQUIRED_LEVELS) {
    if (!levels.has(level)) {
      fail(`${fileName}: brakuje poziomu logowania ${level}.`);
    }
  }

  if (correlationIds.size < 2) {
    fail(`${fileName}: wymagane co najmniej dwa różne correlationId (znaleziono ${correlationIds.size}).`);
  }

  const requiredStatuses = REQUIRED_STATUS_CODES[fileName] || [];
  for (const status of requiredStatuses) {
    if (!statuses.has(status)) {
      fail(`${fileName}: brakuje wymaganego statusu HTTP ${status}.`);
    }
  }

  if (fileName === "lab-timeout.log") {
    const retrySeconds = new Set(
      entries
        .filter((entry) => entry.event === "lab_send_retry_scheduled")
        .map((entry) => entry.retryAfterSeconds)
    );
    for (const expected of [15, 30, 60]) {
      if (!retrySeconds.has(expected)) {
        fail(`lab-timeout.log: brakuje zaplanowanego ponowienia po ${expected} s.`);
      }
    }
  }

  // Sekrety, hasła, PESEL-e i nazwy kontrolowanych błędów.
  for (const secret of FORBIDDEN_SECRET_VALUES) {
    if (raw.includes(secret)) {
      fail(`${fileName}: zawiera zakazaną wartość sekretu/hasła ("${secret}").`);
    }
  }
  for (const pesel of KNOWN_TEST_PESELS) {
    if (raw.includes(pesel)) {
      fail(`${fileName}: zawiera znany testowy numer PESEL.`);
    }
  }
  if (PESEL_LIKE_PATTERN.test(raw)) {
    fail(`${fileName}: zawiera wartość wyglądającą jak numer PESEL w polu "pesel".`);
  }
  for (const bugName of CONTROLLED_BUG_NAMES) {
    if (raw.includes(bugName)) {
      fail(`${fileName}: ujawnia nazwę kontrolowanego defektu ("${bugName}").`);
    }
  }
  if (ROOT_CAUSE_MARKER_PATTERN.test(raw)) {
    fail(`${fileName}: zawiera znacznik w stylu ROOT_CAUSE.`);
  }
}

function validateReadme() {
  const readmePath = join(LOGS_DIR, "README.md");
  if (!existsSync(readmePath)) {
    fail("README.md: plik nie istnieje w workshop-assets/logs/.");
    return;
  }
  const content = readFileSync(readmePath, "utf8");
  for (const bugName of CONTROLLED_BUG_NAMES) {
    if (content.includes(bugName)) {
      fail(`README.md: ujawnia nazwę kontrolowanego defektu ("${bugName}").`);
    }
  }
  if (ROOT_CAUSE_MARKER_PATTERN.test(content)) {
    fail("README.md: zawiera znacznik w stylu ROOT_CAUSE.");
  }
}

function fail(message) {
  failures += 1;
  console.error(`✗ ${message}`);
}
