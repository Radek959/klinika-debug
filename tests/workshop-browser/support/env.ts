/**
 * Konfiguracja `npm run test:workshop-browser` czytana z env. To NIE jest
 * bramka CI — suite jest uruchamiana ręcznie (albo przez opcjonalny
 * `workflow_dispatch`) przeciwko RZECZYWIŚCIE WDROŻONEJ Klinice Debug, tym
 * samym wzorcem co `npm run workshop:smoke` (`scripts/workshop-smoke/config.cjs`).
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Zmienna środowiskowa ${name} jest wymagana.`);
  }
  return value.trim();
}

/** Destrukcyjny przebieg (tworzenie danych, reset środowiska) wymaga jawnego potwierdzenia. */
export const WORKSHOP_E2E_CONFIRMED = process.env.WORKSHOP_E2E_CONFIRM === "RUN";

export function readWorkshopBaseUrl(): string {
  return requireEnv("WORKSHOP_BASE_URL").replace(/\/+$/, "");
}

export function readWorkshopStaffPassword(): string {
  return requireEnv("WORKSHOP_STAFF_PASSWORD");
}

export function readWorkshopAdminPassword(): string {
  return requireEnv("WORKSHOP_ADMIN_PASSWORD");
}
