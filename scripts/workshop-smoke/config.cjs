"use strict";

const { URL } = require("node:url");

// Spójne z progiem maskowania sekretów w lib.cjs (MIN_MASKABLE_SECRET_LENGTH)
// — hasło krótsze niż ten próg nie dałoby się bezpiecznie zamaskować w
// logach smoke testu.
const MIN_PASSWORD_LENGTH = 6;

/**
 * Konfiguracja `npm run workshop:smoke` odczytana z env. Nie zawiera żadnej
 * logiki HTTP — tylko czytanie i walidację zmiennych, żeby dało się to
 * testować jednostkowo bez sieci.
 */
function readWorkshopSmokeConfig(env) {
  const errors = [];

  const baseUrlRaw = nonEmpty(env.WORKSHOP_BASE_URL);
  let baseUrl;
  if (!baseUrlRaw) {
    errors.push("WORKSHOP_BASE_URL jest wymagane (np. https://klinikadebug.rwasik.pl).");
  } else {
    try {
      const parsed = new URL(baseUrlRaw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("unsupported protocol");
      }
      baseUrl = baseUrlRaw.replace(/\/+$/, "");
    } catch {
      errors.push(`WORKSHOP_BASE_URL nie jest poprawnym URL-em: "${baseUrlRaw}".`);
    }
  }

  const staffPassword = nonEmpty(env.WORKSHOP_STAFF_PASSWORD);
  if (!staffPassword) {
    errors.push("WORKSHOP_STAFF_PASSWORD jest wymagane (hasło kont testerXX).");
  } else if (staffPassword.length < MIN_PASSWORD_LENGTH) {
    errors.push(`WORKSHOP_STAFF_PASSWORD musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`);
  }

  const adminPassword = nonEmpty(env.WORKSHOP_ADMIN_PASSWORD);
  if (!adminPassword) {
    errors.push("WORKSHOP_ADMIN_PASSWORD jest wymagane (hasło panelu /admin).");
  } else if (adminPassword.length < MIN_PASSWORD_LENGTH) {
    errors.push(`WORKSHOP_ADMIN_PASSWORD musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`);
  }

  if (errors.length > 0) {
    throw new Error(`Nieprawidłowa konfiguracja workshop:smoke:\n- ${errors.join("\n- ")}`);
  }

  const confirmed = env.WORKSHOP_SMOKE_CONFIRM === "RUN";
  const labTimeoutMs = readPositiveInt(env.WORKSHOP_SMOKE_LAB_TIMEOUT_MS, 30000);
  const pollIntervalMs = readPositiveInt(env.WORKSHOP_SMOKE_POLL_INTERVAL_MS, 1000);
  const requestTimeoutMs = readPositiveInt(env.WORKSHOP_SMOKE_REQUEST_TIMEOUT_MS, 15000);

  return {
    baseUrl,
    staffPassword,
    adminPassword,
    confirmed,
    labTimeoutMs,
    pollIntervalMs,
    requestTimeoutMs,
    secrets: [staffPassword, adminPassword]
  };
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readPositiveInt(raw, fallback) {
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Nieprawidłowa wartość liczbowa: "${raw}".`);
  }
  return parsed;
}

module.exports = { readWorkshopSmokeConfig };
