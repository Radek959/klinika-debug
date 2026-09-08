import { defineConfig, devices } from "@playwright/test";
import { WORKSHOP_E2E_CONFIRMED } from "./support/env";

/**
 * Mały, ręcznie uruchamiany suite przeciwko RZECZYWIŚCIE WDROŻONEJ Klinice
 * Debug (`WORKSHOP_BASE_URL`) — chroni flow, które właściciel testuje
 * manualnie, a nie regresję całej aplikacji. Globalny konfig panelu
 * `/admin` (scenariusz, labDelayMs) nie nadaje się do równoległych testów,
 * więc suite jest serial i ma dokładnie jednego workera.
 */
export default defineConfig({
  testDir: "./journeys",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: WORKSHOP_E2E_CONFIRMED ? require.resolve("./global-setup") : undefined,
  globalTeardown: WORKSHOP_E2E_CONFIRMED ? require.resolve("./global-teardown") : undefined,
  use: {
    baseURL: process.env.WORKSHOP_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
