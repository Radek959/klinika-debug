import { request } from "@playwright/test";
import { applyCleanBaseline } from "./support/admin-api";
import { readWorkshopAdminPassword, readWorkshopBaseUrl } from "./support/env";

/**
 * Cleanup: SUCCESS + CLEAN + labDelay=5min + reset. Jeżeli to się nie
 * powiedzie, środowisko może zostać w nieoczekiwanym stanie (np. aktywny
 * kontrolowany defekt albo krótki labDelay) — wypisujemy jednoznaczny
 * komunikat zamiast cichego niepowodzenia.
 */
export default async function globalTeardown(): Promise<void> {
  const baseURL = readWorkshopBaseUrl();
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
