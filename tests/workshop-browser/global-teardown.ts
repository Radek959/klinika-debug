import { request } from "@playwright/test";
import { applyCleanBaseline } from "./support/admin-api";
import {
  assertWorkshopE2eConfirmed,
  readWorkshopAdminPassword,
  readWorkshopBrowserBaseUrl
} from "./support/env";

/**
 * Cleanup: SUCCESS + CLEAN + labDelay=5min + reset. Jeżeli to się nie
 * powiedzie, środowisko może zostać w nieoczekiwanym stanie (np. aktywny
 * kontrolowany defekt albo krótki labDelay) — wypisujemy jednoznaczny
 * komunikat zamiast cichego niepowodzenia.
 *
 * Playwright uruchamia teardown tylko wtedy, gdy `globalSetup` zakończył
 * się sukcesem (czyli `WORKSHOP_E2E_CONFIRM=RUN` już było ustawione) —
 * `assertWorkshopE2eConfirmed` jest tu wyłącznie dodatkowym zabezpieczeniem
 * spójnym z `global-setup.ts`.
 */
export default async function globalTeardown(): Promise<void> {
  assertWorkshopE2eConfirmed();

  const baseURL = readWorkshopBrowserBaseUrl();
  const adminPassword = readWorkshopAdminPassword();

  const context = await request.newContext({ baseURL });
  try {
    await applyCleanBaseline(context, adminPassword, 300000);
  } catch (error) {
    console.error("Środowisko wymaga ręcznego resetu.");
    console.error(error instanceof Error ? error.message : error);
    throw error;
  } finally {
    await context.dispose();
  }
}
