/**
 * Kontrolowane defekty warsztatowe wybierane globalnie z panelu `/admin`.
 *
 * `CLEAN` oznacza zawsze poprawne, zgodne z dokumentacją produktową
 * zachowanie aplikacji. Ten plik jest jedynym miejscem, w którym trzeba
 * dopisać nowy defekt — sam panel `/admin` i warstwa konfiguracji
 * (`WorkshopConfigService`) odczytują dozwolone wartości stąd, a nie z
 * osobnej, zduplikowanej listy. Aktywny może być co najwyżej jeden defekt
 * naraz (albo `CLEAN` — brak żadnego).
 *
 * Każdy defekt poniżej jest zaimplementowany jako mała, jawna gałąź w
 * odpowiedniej warstwie, oznaczona komentarzem `WORKSHOP CONTROLLED DEFECT`:
 * - `PATIENT_GUARDIAN` — `packages/domain/src/patients/patient-write.ts`
 *   (`PatientWriteValidationOptions.disableGuardianRequiredRule`), wołane z
 *   `apps/api/src/patients/patients.service.ts`;
 * - `ORDER_FLOW` — `packages/domain/src/orders/sample-collection.ts`
 *   (`OrderStatusAfterSampleCollectionOptions.forceCollectedAfterFirstSample`),
 *   wołane z `apps/api/src/orders/orders.service.ts` (`registerSample`);
 * - `API_DIAGNOSTICS` — `apps/api/src/orders/orders.service.ts`
 *   (`sendOrder`), przed wywołaniem symulatora laboratorium;
 * - `PATIENT_EDIT_NOT_SAVED` — `apps/api/src/patients/patients.service.ts`
 *   (`update`), tuż przed zapisem: pole `phone` zapisywane do bazy jest
 *   cofane do poprzedniej wartości, mimo że odpowiedź nadal zgłasza sukces;
 * - `ORDER_PRIORITY_MAPPING` — czysto frontendowy defekt. Backend jedynie
 *   udostępnia neutralny, celowo opaque sygnał `catalogFlag` w odpowiedzi
 *   katalogu badań (`apps/api/src/tests-catalog/tests-catalog.service.ts`),
 *   a właściwe (błędne) mapowanie priorytetu `URGENT` → `ROUTINE` w
 *   requeście tworzenia zlecenia wykonuje `apps/web/src/orders/NewOrderPage.tsx`
 *   razem z `apps/web/src/orders/orderFormState.ts`
 *   (`buildCreateOrderPayload`). Backend `POST /api/v1/orders` zawsze zapisuje
 *   dokładnie to, co dostał w requeście.
 */
export const CONTROLLED_BUGS = [
  "CLEAN",
  "PATIENT_GUARDIAN",
  "ORDER_FLOW",
  "API_DIAGNOSTICS",
  "PATIENT_EDIT_NOT_SAVED",
  "ORDER_PRIORITY_MAPPING"
] as const;

export type ControlledBug = (typeof CONTROLLED_BUGS)[number];

export const DEFAULT_CONTROLLED_BUG: ControlledBug = "CLEAN";

export function isControlledBug(value: string): value is ControlledBug {
  return (CONTROLLED_BUGS as readonly string[]).includes(value);
}

export function assertControlledBug(value: string): ControlledBug {
  if (!isControlledBug(value)) {
    throw new Error(
      `Nieprawidłowy kontrolowany błąd: "${value}". Dozwolone wartości: ${CONTROLLED_BUGS.join(", ")}.`
    );
  }
  return value;
}
