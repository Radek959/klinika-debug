"use strict";

/**
 * Współdzielone, testowalne helpery `npm run workshop:smoke`.
 *
 * Ten moduł nie zna nic o konkretnych endpointach Kliniki Debug — trzyma
 * tylko generyczne mechanizmy (klient HTTP, maskowanie sekretów, polling,
 * raport końcowy), żeby dało się je pokryć testami jednostkowymi bez
 * prawdziwego, wdrożonego środowiska. Logikę poszczególnych kroków smoke
 * testu zawiera `scripts/workshop-smoke.cjs`.
 */

const { setTimeout: delay } = require("node:timers/promises");

/**
 * Zastępuje w tekście każde wystąpienie podanych sekretów ciągiem
 * `[REDACTED]`. Używane przed KAŻDYM console.log/console.error, żeby smoke
 * nigdy nie wypisał haseł, tokenów ani cookies, nawet pośrednio (np. w
 * treści błędu HTTP).
 */
// Krótsze "sekrety" (np. literówka w testach albo trywialne hasło lokalne)
// są zbyt prawdopodobne jako zwykłe fragmenty słów w komunikatach — ich
// maskowanie psułoby czytelność raportu. Prawdziwe hasła produkcyjne są
// dłuższe, więc ten próg nie osłabia ochrony przed wyciekiem sekretów.
const MIN_MASKABLE_SECRET_LENGTH = 6;

function maskSecrets(text, secrets) {
  if (typeof text !== "string") {
    return text;
  }

  let masked = text;
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= MIN_MASKABLE_SECRET_LENGTH) {
      masked = masked.split(secret).join("[REDACTED]");
    }
  }
  return masked;
}

/**
 * Prosty klient HTTP dla smoke testu: dokłada nagłówki, potrafi wysyłać
 * ciasteczka sesji admina, i nigdy nie wypisuje treści żądania/odpowiedzi
 * na stdout/stderr samodzielnie — to obowiązek wywołującego (z użyciem
 * `maskSecrets`).
 */
class HttpClient {
  constructor(baseUrl, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.cookies = new Map();
  }

  setCookie(name, value) {
    this.cookies.set(name, value);
  }

  cookieHeader() {
    if (this.cookies.size === 0) {
      return undefined;
    }
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  async request(method, path, { headers = {}, body, expectJson = true } = {}) {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const requestHeaders = { ...headers };
    const cookieHeader = this.cookieHeader();
    if (cookieHeader) {
      requestHeaders.Cookie = cookieHeader;
    }
    if (body !== undefined) {
      requestHeaders["Content-Type"] = "application/json";
    }

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });

      this.captureSetCookie(response);

      const text = await response.text();
      const correlationId = response.headers.get("x-correlation-id");
      const retryAfterRaw = response.headers.get("retry-after");
      const retryAfter = retryAfterRaw === null ? null : Number(retryAfterRaw);

      let json;
      if (expectJson && text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
      }

      return {
        status: response.status,
        ok: response.ok,
        headers: response.headers,
        correlationId,
        retryAfter,
        text,
        json
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  captureSetCookie(response) {
    const rawHeaders =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : response.headers.get("set-cookie")
          ? [response.headers.get("set-cookie")]
          : [];

    for (const rawCookie of rawHeaders) {
      const [pair] = rawCookie.split(";");
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }
      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      this.setCookie(name, value);
    }
  }

  get(path, options) {
    return this.request("GET", path, options);
  }

  post(path, body, options = {}) {
    return this.request("POST", path, { ...options, body });
  }

  put(path, body, options = {}) {
    return this.request("PUT", path, { ...options, body });
  }
}

/**
 * Odpytuje `fn` w regularnym, konfigurowalnym interwale aż zwróci wartość
 * uznaną za końcową przez `isDone`, albo upłynie `timeoutMs`. Nigdy nie
 * jest to pętla typu busy loop — między próbami zawsze czeka `intervalMs`.
 */
async function pollUntil(fn, { isDone, intervalMs = 1000, timeoutMs = 30000, onAttempt } = {}) {
  const startedAt = Date.now();
  let attempt = 0;

  while (true) {
    attempt += 1;
    const value = await fn();
    if (onAttempt) {
      onAttempt(value, attempt);
    }
    if (isDone(value)) {
      return value;
    }

    if (Date.now() - startedAt >= timeoutMs) {
      const error = new Error(`Przekroczono limit czasu oczekiwania (${timeoutMs} ms).`);
      error.lastValue = value;
      error.timedOut = true;
      throw error;
    }

    await delay(intervalMs);
  }
}

/** Znany, stały porządek wierszy raportu smoke — patrz README smoke testu. */
const REPORT_STEP_ORDER = [
  "Health",
  "Admin login",
  "Reset",
  "Lab delay setup",
  "Participant login",
  "Workspace isolation",
  "Patient flow",
  "Order flow",
  "Lab SUCCESS",
  "Correlation ID",
  "PATIENT_GUARDIAN",
  "ORDER_FLOW",
  "API_DIAGNOSTICS",
  "OpenAPI",
  "Log fixtures",
  "Final cleanup"
];

class SmokeReport {
  constructor() {
    this.results = new Map();
  }

  record(step, status, detail) {
    this.results.set(step, { status, detail });
  }

  pass(step, detail) {
    this.record(step, "PASS", detail);
  }

  skip(step, detail) {
    this.record(step, "SKIP", detail);
  }

  fail(step, detail) {
    this.record(step, "FAIL", detail);
  }

  hasFailure() {
    return Array.from(this.results.values()).some((entry) => entry.status === "FAIL");
  }

  render(title = "Workshop readiness smoke") {
    const lines = [title, ""];
    const labelWidth = Math.max(
      ...REPORT_STEP_ORDER.filter((step) => this.results.has(step)).map((step) => step.length),
      0
    );

    for (const step of REPORT_STEP_ORDER) {
      if (!this.results.has(step)) {
        continue;
      }
      const { status, detail } = this.results.get(step);
      const suffix = detail ? ` — ${detail}` : "";
      lines.push(`${step.padEnd(labelWidth + 2)}${status}${suffix}`);
    }

    lines.push("");
    lines.push(`RESULT: ${this.hasFailure() ? "FAIL" : "PASS"}`);
    return lines.join("\n");
  }
}

const PESEL_WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];

// Kodowanie stulecia w numerze PESEL (miesiąc + przesunięcie), odwrotność
// tabeli z packages/domain/src/patients/pesel.ts#readPeselCentury.
const PESEL_CENTURY_RANGES = [
  { yearBase: 1900, monthOffset: 0 },
  { yearBase: 2000, monthOffset: 20 },
  { yearBase: 2100, monthOffset: 40 },
  { yearBase: 2200, monthOffset: 60 },
  { yearBase: 1800, monthOffset: 80 }
];

function resolvePeselCenturyOffset(birthYear) {
  const century = PESEL_CENTURY_RANGES.find(
    (range) => birthYear >= range.yearBase && birthYear < range.yearBase + 100
  );
  if (!century) {
    throw new Error(`Nieobsługiwany rok urodzenia dla syntetycznego PESEL-u: ${birthYear}.`);
  }
  return century;
}

/**
 * Generuje syntetyczny, ale strukturalnie poprawny PESEL (poprawna suma
 * kontrolna) dla podanego roku urodzenia i `serial` (0-999), żeby kolejne
 * uruchomienia smoke mogły użyć różnych, unikalnych numerów bez kolizji z
 * danymi startowymi workspace'u. Nigdy nie reprezentuje prawdziwej osoby.
 */
function generateSyntheticPesel({ birthYear, serial }) {
  if (!Number.isInteger(serial) || serial < 0 || serial > 999) {
    throw new Error("serial musi być liczbą całkowitą z zakresu 0-999.");
  }
  if (!Number.isInteger(birthYear)) {
    throw new Error("birthYear musi być liczbą całkowitą.");
  }

  const century = resolvePeselCenturyOffset(birthYear);
  const yearPart = String((birthYear - century.yearBase) % 100).padStart(2, "0");
  const month = String(1 + century.monthOffset).padStart(2, "0");
  const day = "15";
  const genderDigit = 5; // nieparzysta -> mężczyzna, wystarczające dla smoke
  const serialDigits = String(serial).padStart(3, "0");
  const base = `${yearPart}${month}${day}${serialDigits}${genderDigit}`;

  const sum = PESEL_WEIGHTS.reduce(
    (total, weight, index) => total + Number(base[index]) * weight,
    0
  );
  const checksum = (10 - (sum % 10)) % 10;
  return `${base}${checksum}`;
}

/** Wygodny skrót: syntetyczny PESEL dorosłego (rocznik 1990). */
function generateSyntheticAdultPesel(serial) {
  return generateSyntheticPesel({ birthYear: 1990, serial });
}

/** Syntetyczny PESEL niepełnoletniego (10 lat wstecz od bieżącego roku). */
function generateSyntheticMinorPesel(serial) {
  const birthYear = new Date().getUTCFullYear() - 10;
  return generateSyntheticPesel({ birthYear, serial });
}

module.exports = {
  maskSecrets,
  HttpClient,
  pollUntil,
  SmokeReport,
  REPORT_STEP_ORDER,
  generateSyntheticPesel,
  generateSyntheticAdultPesel,
  generateSyntheticMinorPesel
};
