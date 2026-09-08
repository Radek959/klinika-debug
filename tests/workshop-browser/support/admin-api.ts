import type { APIRequestContext } from "@playwright/test";

/**
 * Minimalny klient panelu `/admin` używany do przygotowania i sprzątania
 * środowiska wokół browser journeys (Setup/Cleanup). Sekrety (hasło panelu)
 * NIGDY nie są logowane.
 */

export type LabScenario =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "SAMPLE_REJECTED"
  | "VALIDATION_ERROR"
  | "RATE_LIMIT"
  | "SERVER_ERROR"
  | "TIMEOUT";

export type ControlledBug = "CLEAN" | "PATIENT_GUARDIAN" | "ORDER_FLOW" | "API_DIAGNOSTICS";

export async function adminLogin(request: APIRequestContext, adminPassword: string): Promise<void> {
  const response = await request.post("/admin/api/login", { data: { password: adminPassword } });
  if (!response.ok()) {
    throw new Error(`Logowanie do /admin nie powiodło się (HTTP ${response.status()}).`);
  }
}

export async function adminSetConfig(
  request: APIRequestContext,
  config: { labScenario: LabScenario; controlledBug: ControlledBug; labDelayMs: number }
): Promise<void> {
  const response = await request.put("/admin/api/config", { data: config });
  if (!response.ok()) {
    throw new Error(`Zapis konfiguracji /admin/api/config nie powiódł się (HTTP ${response.status()}).`);
  }
}

export async function adminReset(request: APIRequestContext): Promise<void> {
  const response = await request.post("/admin/api/reset", { data: { confirm: true } });
  if (!response.ok()) {
    throw new Error(`Reset środowiska /admin/api/reset nie powiódł się (HTTP ${response.status()}).`);
  }
}

/** SUCCESS + CLEAN + wybrany labDelayMs + reset — sekwencja Setup/Cleanup z README suite'u. */
export async function applyCleanBaseline(
  request: APIRequestContext,
  adminPassword: string,
  labDelayMs: number
): Promise<void> {
  await adminLogin(request, adminPassword);
  await adminSetConfig(request, { labScenario: "SUCCESS", controlledBug: "CLEAN", labDelayMs });
  await adminReset(request);
}
