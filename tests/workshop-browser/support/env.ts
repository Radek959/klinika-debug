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

/**
 * Destrukcyjny przebieg (tworzenie danych, reset środowiska) wymaga jawnego
 * potwierdzenia. Bez niego cały suite ma zakończyć się BŁĘDEM — nigdy "PASS"
 * z pominiętymi (skipped) testami, bo to fałszywie wyglądałoby jak
 * przejście obowiązkowej lokalnej bramki przed PR-em.
 */
export const WORKSHOP_E2E_CONFIRMED = process.env.WORKSHOP_E2E_CONFIRM === "RUN";

export function assertWorkshopE2eConfirmed(): void {
  if (!WORKSHOP_E2E_CONFIRMED) {
    throw new Error("Browser tests wymagają WORKSHOP_E2E_CONFIRM=RUN.");
  }
}

/**
 * Adres lokalnego środowiska, przeciwko któremu działa Playwright. CELOWO
 * osobna zmienna od `WORKSHOP_BASE_URL` — ta ostatnia zostaje wyłącznie dla
 * `npm run workshop:smoke` (uruchamianego przeciwko wdrożonemu środowisku).
 * Domyślnie `http://localhost:3000`, więc standardowe lokalne uruchomienie
 * nie wymaga podawania żadnego URL-a.
 */
const DEFAULT_WORKSHOP_BROWSER_BASE_URL = "http://localhost:3000";

/** Hosty, przeciwko którym wolno uruchamiać destrukcyjne journeys. */
const ALLOWED_LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export function readWorkshopBrowserBaseUrl(): string {
  const raw = process.env.WORKSHOP_BROWSER_BASE_URL?.trim() || DEFAULT_WORKSHOP_BROWSER_BASE_URL;
  const baseUrl = raw.replace(/\/+$/, "");
  assertLocalWorkshopBrowserBaseUrl(baseUrl);
  return baseUrl;
}

/**
 * Odmawia uruchomienia, jeżeli `WORKSHOP_BROWSER_BASE_URL` nie wskazuje na
 * lokalny host — wywoływana zanim padnie jakikolwiek request sieciowy (na
 * starcie `global-setup`/`global-teardown`), więc błędna konfiguracja (np.
 * pozostawiony publiczny adres) nigdy nie dociera do żadnego rzeczywistego
 * środowiska. Wyeksportowana osobno, żeby dało się ją pokryć testem
 * jednostkowym bez sieci.
 */
export function assertLocalWorkshopBrowserBaseUrl(baseUrl: string): void {
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    throw new Error(`WORKSHOP_BROWSER_BASE_URL nie jest poprawnym URL-em: "${baseUrl}".`);
  }

  // `URL#hostname` zwraca adres IPv6 w nawiasach kwadratowych (np. "[::1]"
  // dla "http://[::1]:3000") — trzeba je zdjąć przed porównaniem z listą
  // dozwolonych hostów.
  const normalizedHostname = hostname.replace(/^\[|\]$/g, "");
  if (!ALLOWED_LOCAL_HOSTNAMES.has(normalizedHostname)) {
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
