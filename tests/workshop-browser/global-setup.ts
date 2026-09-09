import { request } from "@playwright/test";
import { applyCleanBaseline } from "./support/admin-api";
import {
  assertWorkshopE2eConfirmed,
  readWorkshopAdminPassword,
  readWorkshopBrowserBaseUrl
} from "./support/env";

/**
 * Setup: SUCCESS + CLEAN + labDelay=5s + reset — patrz README suite'u.
 *
 * Zawsze uruchamiany (patrz `playwright.config.ts`), niezależnie od
 * `WORKSHOP_E2E_CONFIRM` — dzięki temu `npm run test:workshop-browser` bez
 * potwierdzenia kończy się BŁĘDEM (non-zero exit code), a nie cichym
 * "X skipped" wyglądającym jak przejście bramki.
 */
export default async function globalSetup(): Promise<void> {
  assertWorkshopE2eConfirmed();

  const baseURL = readWorkshopBrowserBaseUrl();
  const adminPassword = readWorkshopAdminPassword();

  const context = await request.newContext({ baseURL });
  try {
    await applyCleanBaseline(context, adminPassword, 5000);
  } finally {
    await context.dispose();
  }
}
