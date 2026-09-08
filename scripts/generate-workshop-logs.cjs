#!/usr/bin/env node
"use strict";

/**
 * Deterministyczny generator syntetycznych fixture'ów logów warsztatowych.
 *
 * Uruchomienie: `node scripts/generate-workshop-logs.cjs`
 *
 * Cel: wygenerować materiał do ćwiczeń analizy logów (`workshop-log-fixtures`),
 * zgodny z rzeczywistymi endpointami, kodami błędów, harmonogramem retry i
 * mechanizmem correlationId Kliniki Debug (a nie wymyślonym stosem
 * technologicznym). Generator jest deterministyczny: to samo ziarno (SEED
 * poniżej) zawsze daje identyczny wynik — dzięki temu wygenerowane pliki
 * `.log` w repo są odtwarzalne, a nie "zamrożonym" jednorazowym artefaktem.
 *
 * Wynikowe pliki JSONL trafiają do `workshop-assets/logs/`. Ten skrypt NIE
 * łączy się z żadną bazą, API ani usługą zewnętrzną — wszystkie dane są
 * generowane lokalnie i syntetycznie.
 */

const { writeFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const OUTPUT_DIR = join(__dirname, "..", "workshop-assets", "logs");
const SEED = 20260908;
const SERVICE_NAME = "klinika-api";
const ENVIRONMENT = "workshop";

// ---------------------------------------------------------------------------
// PRNG deterministyczny (mulberry32) — brak zależności od Math.random().
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRng(seed) {
  const next = mulberry32(seed);
  return {
    float: () => next(),
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick(array) {
      return array[Math.floor(next() * array.length)];
    },
    bool(probabilityTrue) {
      return next() < probabilityTrue;
    },
    hex(length) {
      let out = "";
      for (let i = 0; i < length; i += 1) {
        out += Math.floor(next() * 16).toString(16);
      }
      return out;
    }
  };
}

function uuidFrom(rng) {
  const h = rng.hex(32).split("");
  h[12] = "4";
  h[16] = ["8", "9", "a", "b"][Math.floor(rng.float() * 4)];
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------
// Zegar: przesuwa czas o zadany zakres milisekund i formatuje ISO 8601.
// ---------------------------------------------------------------------------
function createClock(rng, startIso) {
  let current = new Date(startIso).getTime();
  return {
    now: () => new Date(current).toISOString(),
    tick(minMs, maxMs) {
      current += rng.int(minMs, maxMs);
      return new Date(current).toISOString();
    },
    jump(ms) {
      current += ms;
      return new Date(current).toISOString();
    },
    currentMs: () => current
  };
}

// ---------------------------------------------------------------------------
// Bufor linii JSONL wspólny dla wszystkich scenariuszy.
// ---------------------------------------------------------------------------
function createBuffer() {
  const lines = [];
  return {
    push(entry) {
      // Kolejność pól jest celowo ustalona, żeby plik był czytelny do
      // ręcznego przeglądania (timestamp/level/service najpierw).
      const ordered = {
        timestamp: entry.timestamp,
        level: entry.level,
        service: entry.service || SERVICE_NAME,
        environment: entry.environment || ENVIRONMENT,
        correlationId: entry.correlationId,
        event: entry.event,
        component: entry.component,
        ...rest(entry)
      };
      lines.push(JSON.stringify(stripUndefined(ordered)));
    },
    lines,
    count: () => lines.length
  };

  function rest(entry) {
    const KNOWN_KEYS = [
      "timestamp",
      "level",
      "service",
      "environment",
      "correlationId",
      "event",
      "component"
    ];
    const others = {};
    for (const [key, value] of Object.entries(entry)) {
      if (!KNOWN_KEYS.includes(key)) {
        others[key] = value;
      }
    }
    return others;
  }
}

function stripUndefined(object) {
  const output = {};
  for (const [key, value] of Object.entries(object)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

// ---------------------------------------------------------------------------
// Wspólne słowniki: workspace'y, konta, endpointy szumu.
// ---------------------------------------------------------------------------
const NOISE_WORKSPACES = [
  { slug: "warsztat-03", login: "tester03" },
  { slug: "warsztat-07", login: "tester07" },
  { slug: "warsztat-11", login: "tester11" },
  { slug: "warsztat-14", login: "tester14" },
  { slug: "klinika-pokazowa", login: "staff.demo" }
];

const NOISE_GET_ENDPOINTS = [
  { path: "/api/v1/patients", component: "PatientsController" },
  { path: "/api/v1/orders", component: "OrdersController" },
  { path: "/api/v1/orders/{orderId}/history", component: "OrderHistoryController" },
  { path: "/api/v1/auth/me", component: "AuthController" }
];

const HEALTH_ENDPOINTS = ["/health/live", "/health/ready"];

function randomCorrelationId(rng) {
  return uuidFrom(rng);
}

/**
 * Jeden wpis "dostępowy" żądania HTTP zakończonego odpowiedzią — pojedyncza
 * linia na żądanie, tak jak realny access log warstwy API (metoda, ścieżka,
 * status, czas wykonania), z opcjonalnym `errorCode` dla odpowiedzi błędu w
 * jednolitym formacie (`error.code`, `error.correlationId`).
 */
function httpEntry(clock, rng, opts) {
  const durationMs = opts.durationMs ?? rng.int(8, 180);
  return {
    timestamp: clock.tick(opts.minGapMs ?? 40, opts.maxGapMs ?? 900),
    level: opts.level || (opts.status >= 500 ? "ERROR" : opts.status >= 400 ? "WARN" : "INFO"),
    correlationId: opts.correlationId,
    event: "http_request_completed",
    component: opts.component || "HttpAdapter",
    method: opts.method,
    path: opts.path,
    status: opts.status,
    durationMs,
    workspaceSlug: opts.workspaceSlug,
    userLogin: opts.userLogin,
    errorCode: opts.errorCode,
    message: opts.message
  };
}

const NOISE_ERROR_EVENTS = [
  {
    event: "duplicate_barcode_rejected",
    component: "OrdersService",
    errorCode: "DUPLICATE_BARCODE",
    message: "Odrzucono rejestrację próbki: kod kreskowy już istnieje w tym workspace."
  },
  {
    event: "duplicate_pesel_rejected",
    component: "PatientsService",
    errorCode: "DUPLICATE_PESEL",
    message: "Odrzucono zapis pacjenta: numer PESEL już istnieje w tym workspace."
  },
  {
    event: "idempotency_key_conflict",
    component: "OrdersService",
    errorCode: "IDEMPOTENCY_KEY_CONFLICT",
    message: "Odrzucono ponowną wysyłkę: dane żądania różnią się od pierwszej próby."
  }
];

function noiseBlock(buffer, clock, rng, count) {
  for (let i = 0; i < count; i += 1) {
    const correlationId = randomCorrelationId(rng);
    const ws = rng.pick(NOISE_WORKSPACES);

    if (rng.bool(0.06)) {
      const errorEvent = rng.pick(NOISE_ERROR_EVENTS);
      buffer.push({
        timestamp: clock.tick(50, 700),
        level: "ERROR",
        correlationId,
        event: errorEvent.event,
        component: errorEvent.component,
        workspaceSlug: ws.slug,
        errorCode: errorEvent.errorCode,
        message: errorEvent.message
      });
      continue;
    }

    if (rng.bool(0.12)) {
      buffer.push(
        httpEntry(clock, rng, {
          correlationId,
          method: "GET",
          path: rng.pick(HEALTH_ENDPOINTS),
          status: 200,
          component: "HealthController",
          durationMs: rng.int(1, 5),
          minGapMs: 200,
          maxGapMs: 2000
        })
      );
      continue;
    }

    const endpoint = rng.pick(NOISE_GET_ENDPOINTS);
    const status = rng.bool(0.92) ? 200 : rng.pick([401, 404, 422]);
    buffer.push(
      httpEntry(clock, rng, {
        correlationId,
        method: "GET",
        path: endpoint.path,
        status,
        component: endpoint.component,
        workspaceSlug: ws.slug,
        userLogin: ws.login,
        errorCode: status === 200 ? undefined : status === 401 ? "AUTHENTICATION_REQUIRED" : status === 404 ? "RESOURCE_NOT_FOUND" : "VALIDATION_ERROR"
      })
    );

    if (rng.bool(0.15)) {
      buffer.push({
        timestamp: clock.tick(5, 40),
        level: "DEBUG",
        correlationId,
        event: "db_query",
        component: "PrismaService",
        message: `Zapytanie do bazy w ${ws.slug} zakończone.`
      });
    }
  }
}

function ensureOutputDir() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

function writeLog(fileName, buffer) {
  const content = `${buffer.lines.join("\n")}\n`;
  writeFileSync(join(OUTPUT_DIR, fileName), content, "utf8");
  return buffer.count();
}

module.exports = {
  createRng,
  createClock,
  createBuffer,
  httpEntry,
  noiseBlock,
  randomCorrelationId,
  uuidFrom,
  ensureOutputDir,
  writeLog,
  NOISE_WORKSPACES,
  SEED
};

if (require.main === module) {
  ensureOutputDir();
  const summary = {};

  summary["happy-path.log"] = require("./workshop-logs/happy-path.cjs")(module.exports);
  summary["patient-error.log"] = require("./workshop-logs/patient-error.cjs")(module.exports);
  summary["order-flow.log"] = require("./workshop-logs/order-flow.cjs")(module.exports);
  summary["lab-timeout.log"] = require("./workshop-logs/lab-timeout.cjs")(module.exports);
  summary["api-diagnostics.log"] = require("./workshop-logs/api-diagnostics.cjs")(module.exports);
  summary["correlation-trace.log"] = require("./workshop-logs/correlation-trace.cjs")(module.exports);
  summary["production-like.log"] = require("./workshop-logs/production-like.cjs")(module.exports);

  console.log("Wygenerowano fixture'y logów warsztatowych:");
  for (const [file, count] of Object.entries(summary)) {
    console.log(`  ${file}: ${count} wpisów`);
  }
}
