import { request } from "@playwright/test";
import { applyCleanBaseline } from "./support/admin-api";
import { readWorkshopAdminPassword, readWorkshopBaseUrl } from "./support/env";

/** Setup: SUCCESS + CLEAN + labDelay=5s + reset — patrz README suite'u. */
export default async function globalSetup(): Promise<void> {
  const baseURL = readWorkshopBaseUrl();
  const adminPassword = readWorkshopAdminPassword();

  const context = await request.newContext({ baseURL });
  try {
    await applyCleanBaseline(context, adminPassword, 5000);
  } finally {
    await context.dispose();
  }
}
