import { defineConfig, devices } from "@playwright/test";

/**
 * Lokalna, obowiązkowa bramka przed KAŻDYM PR-em (AGENTS.md) — NIE jest
 * uruchamiana w CI i NIE służy do testowania Hostingera ani żadnego innego
 * publicznego hosta. Targetem jest wyłącznie lokalny, production-like
 * full-stack Kliniki Debug (`WORKSHOP_BROWSER_BASE_URL`, domyślnie
 * `http://localhost:3000`) — `global-setup.ts` odrzuca każdy nie-lokalny
 * host przed wysłaniem jakiegokolwiek requestu. Globalny config panelu
 * `/admin` (scenariusz, labDelayMs) nie nadaje się do równoległych testów,
 * więc suite jest serial i ma dokładnie jednego workera.
 *
 * `globalSetup`/`globalTeardown` są uruchamiane ZAWSZE (nie tylko po
 * potwierdzeniu) — `global-setup.ts` sam odrzuca start bez
 * `WORKSHOP_E2E_CONFIRM=RUN`, więc uruchomienie bez potwierdzenia kończy się
 * błędem (non-zero exit code), a nie cichym "skipped".
 */
export default defineConfig({
  testDir: "./journeys",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: require.resolve("./global-setup"),
  globalTeardown: require.resolve("./global-teardown"),
  use: {
    baseURL: process.env.WORKSHOP_BROWSER_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
