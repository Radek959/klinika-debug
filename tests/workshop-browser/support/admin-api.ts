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

export type ControlledBug =
  | "CLEAN"
  | "PATIENT_GUARDIAN"
  | "ORDER_FLOW"
  | "API_DIAGNOSTICS"
  | "PATIENT_EDIT_NOT_SAVED"
  | "ORDER_PRIORITY_MAPPING";

export async function adminLogin(request: APIRequestContext, adminPassword: string): Promise<void> {
  const response = await request.post("/admin/api/login", { data: { password: adminPassword } });
  if (!response.ok()) {
    throw new Error(`Logowanie do /admin nie powiodło się (HTTP ${response.status()}).`);
  }
}

export interface AdminConfigState {
  labScenario: LabScenario;
  controlledBug: ControlledBug;
  labDelayMs: number;
}

export async function adminSetConfig(
  request: APIRequestContext,
  config: { labScenario: LabScenario; controlledBug: ControlledBug; labDelayMs: number }
): Promise<AdminConfigState> {
  const response = await request.put("/admin/api/config", { data: config });
  if (!response.ok()) {
    throw new Error(`Zapis konfiguracji /admin/api/config nie powiódł się (HTTP ${response.status()}).`);
  }
  return response.json();
}

export async function adminReset(request: APIRequestContext): Promise<void> {
  const response = await request.post("/admin/api/reset", { data: { confirm: true } });
  if (!response.ok()) {
    throw new Error(`Reset środowiska /admin/api/reset nie powiódł się (HTTP ${response.status()}).`);
  }
}

/**
 * RESET → SUCCESS + CLEAN + wybrany labDelayMs — w tej kolejności. `/admin/api/reset`
 * przywraca domyśle 300000 ms, więc ustawienie `labDelayMs` musi nastąpić PO
 * resecie: gdyby konfiguracja poprzedzała reset, reset cicho nadpisywałby ją
 * z powrotem domyślną wartością i browser suite zaczynałby testy z 5 minutami
 * zamiast oczekiwanego czasu. Po zapisie odczytuje konfigurację z powrotem i
 * failuje natychmiast czytelnym błędem, jeżeli nie zgadza się z oczekiwaną —
 * suite nigdy nie zaczyna testów z błędnym środowiskiem.
 */
export async function applyCleanBaseline(
  request: APIRequestContext,
  adminPassword: string,
  labDelayMs: number
): Promise<void> {
  await adminLogin(request, adminPassword);
  await adminReset(request);
  const config = await adminSetConfig(request, {
    labScenario: "SUCCESS",
    controlledBug: "CLEAN",
    labDelayMs
  });

  if (
    config.labScenario !== "SUCCESS" ||
    config.controlledBug !== "CLEAN" ||
    config.labDelayMs !== labDelayMs
  ) {
    throw new Error(
      "Konfiguracja po ustawieniu nie zgadza się z oczekiwaną " +
        `(labScenario=${config.labScenario}, controlledBug=${config.controlledBug}, ` +
        `labDelayMs=${config.labDelayMs}, oczekiwano labDelayMs=${labDelayMs}).`
    );
  }
}
