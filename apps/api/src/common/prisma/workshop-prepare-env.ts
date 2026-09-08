/**
 * Walidacja konfiguracji dla `npm run workshop:prepare` — powtarzalnego
 * przygotowania środowiska warsztatowego przed szkoleniem.
 *
 * Ten moduł nie implementuje osobnego provisioningu: liczy tylko liczbę
 * uczestników i sprawdza obecność zmiennych wymaganych przez
 * `provisionWorkshopWorkspaces(...)` oraz panel `/admin`, zanim ten
 * provisioning zostanie uruchomiony.
 */

import { WORKSHOP_DEFAULT_PARTICIPANTS, WORKSHOP_MAX_PARTICIPANTS } from "./workshop-workspaces";

export function resolveWorkshopParticipantCount(
  env: Record<string, string | undefined>
): number {
  const raw = env.WORKSHOP_PARTICIPANTS;
  if (raw === undefined || raw.trim() === "") {
    return WORKSHOP_DEFAULT_PARTICIPANTS;
  }

  const parsed = Number(raw);
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > WORKSHOP_MAX_PARTICIPANTS
  ) {
    throw new Error(
      `Nieprawidłowa wartość WORKSHOP_PARTICIPANTS: "${raw}". Podaj liczbę całkowitą z zakresu 1-${WORKSHOP_MAX_PARTICIPANTS}.`
    );
  }

  return parsed;
}

export function validateWorkshopPrepareEnvironment(
  env: Record<string, string | undefined>
): void {
  const errors: string[] = [];
  const nodeEnv = env.NODE_ENV;

  if (nodeEnv === "production" && !readNonEmpty(env.WORKSHOP_STAFF_PASSWORD)) {
    errors.push(
      "WORKSHOP_STAFF_PASSWORD jest wymagane w produkcji (hasło kont STAFF uczestników)."
    );
  }

  const adminPasswordHash = readNonEmpty(env.ADMIN_PASSWORD_HASH);
  if (!adminPasswordHash || adminPasswordHash.length < 8) {
    errors.push(
      "ADMIN_PASSWORD_HASH musi być ustawione (hash hasła panelu prowadzącego /admin)."
    );
  }

  const adminSessionSecret = readNonEmpty(env.ADMIN_SESSION_SECRET);
  if (!adminSessionSecret || adminSessionSecret.length < 16) {
    errors.push("ADMIN_SESSION_SECRET musi mieć co najmniej 16 znaków.");
  }

  if (!readNonEmpty(env.DATABASE_URL)) {
    errors.push("DATABASE_URL musi być ustawione.");
  }

  if (errors.length > 0) {
    throw new Error(
      `Nieprawidłowa konfiguracja workshop:prepare:\n- ${errors.join("\n- ")}`
    );
  }
}

function readNonEmpty(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
