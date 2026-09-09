/**
 * Konfiguracja `npm run test:workshop-browser` czytana z env. To NIE jest
 * bramka CI ani narzędzie do testowania Hostingera — suite jest lokalną,
 * obowiązkową bramką uruchamianą ręcznie przez developera/agenta PRZED
 * utworzeniem PR-a (AGENTS.md), wyłącznie przeciwko lokalnemu środowisku
 * Kliniki Debug.
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

/**
 * Hosty, przeciwko którym wolno uruchamiać destrukcyjne journeys. Świadomie
 * wąska lista — żaden publiczny host (w tym Hostinger) nie jest dozwolony:
 * ten suite nigdy nie ma wysyłać requestów do rzeczywiście wdrożonego
 * środowiska.
 */
const ALLOWED_LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export function readWorkshopBaseUrl(): string {
  const baseUrl = requireEnv("WORKSHOP_BASE_URL").replace(/\/+$/, "");
  assertLocalWorkshopBaseUrl(baseUrl);
  return baseUrl;
}

/**
 * Odmawia uruchomienia, jeżeli `WORKSHOP_BASE_URL` nie wskazuje na lokalny
 * host — wywoływana zanim padnie jakikolwiek request sieciowy (na starcie
 * `global-setup`/`global-teardown`), więc błędna konfiguracja (np.
 * pozostawiony adres Hostingera) nigdy nie dociera do rzeczywiście
 * wdrożonego środowiska.
 */
function assertLocalWorkshopBaseUrl(baseUrl: string): void {
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    throw new Error(`WORKSHOP_BASE_URL nie jest poprawnym URL-em: "${baseUrl}".`);
  }

  if (!ALLOWED_LOCAL_HOSTNAMES.has(hostname)) {
    throw new Error(
      "Browser tests mogą być uruchamiane wyłącznie przeciwko lokalnemu środowisku."
    );
  }
}

export function readWorkshopStaffPassword(): string {
  return requireEnv("WORKSHOP_STAFF_PASSWORD");
}

export function readWorkshopAdminPassword(): string {
  return requireEnv("WORKSHOP_ADMIN_PASSWORD");
}
