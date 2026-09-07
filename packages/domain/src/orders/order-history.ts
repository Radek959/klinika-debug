import type { LabSendRetryCancellationReason } from "./lab-send-retry";
import type { OrderMaterialType } from "./order-creation";
import type { OrderStatus } from "./order-status";

export type OrderHistoryEventType =
  | "ORDER_CREATED"
  | "ORDER_UPDATED"
  | "SAMPLE_REGISTERED"
  | "ORDER_SENT_TO_LAB"
  | "LAB_ORDER_ACCEPTED"
  | "LAB_RESULT_RECEIVED"
  | "LAB_SAMPLE_REJECTED"
  | "LAB_ORDER_REJECTED"
  | "LAB_RATE_LIMIT_RECEIVED"
  | "LAB_SEND_RETRY"
  | "TECHNICAL_ERROR";

export type OrderHistoryActorType = "STAFF" | "SYSTEM" | "LAB";

export type OrderHistoryChangedField = "patientId" | "priority" | "tests";

export interface OrderCreatedDetails {
  reconstructed?: true;
  priority?: "ROUTINE" | "URGENT";
  testCodes?: string[];
  requiredMaterials?: OrderMaterialType[];
  finalStatus?: OrderStatus;
}

export interface OrderUpdatedDetails {
  changedFields: OrderHistoryChangedField[];
  patientChanged: boolean;
  previousPriority?: "ROUTINE" | "URGENT";
  newPriority?: "ROUTINE" | "URGENT";
  addedTestCodes: string[];
  removedTestCodes: string[];
}

export interface SampleRegisteredDetails {
  materialType: OrderMaterialType;
  sampleId: string;
  previousOrderStatus: OrderStatus;
  newOrderStatus: OrderStatus;
}

export interface OrderSentToLabDetails {
  idempotencyKey: string;
  correlationId: string | null;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
}

/**
 * Szczegóły synchronicznego przyjęcia zlecenia przez laboratorium.
 *
 * Nazwa aktywnego scenariusza symulatora jest wewnętrznym trybem środowiska
 * i celowo nie należy do tych szczegółów — historia zlecenia jest widoczna dla
 * uczestnika warsztatu i nie może ujawniać, jaki scenariusz jest włączony.
 */
export interface LabOrderAcceptedDetails {
  externalOrderId: string;
  estimatedCompletionAt: string;
}

export interface LabResultReceivedDetails {
  eventId: string;
  externalOrderId: string;
  callbackStatus: "PARTIAL" | "COMPLETED";
  resultCount: number;
  testCodes: string[];
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
}

/** Pojedyncza próbka odrzucona przez laboratorium w danym callbacku. */
export interface LabSampleRejectedItem {
  sampleId: string;
  materialType: OrderMaterialType;
  rejectionCode: string;
  rejectionReason: string;
}

/**
 * Szczegóły zdarzenia odrzucenia próbek przez laboratorium.
 *
 * Kontrakt callbacka dopuszcza odrzucenie wielu próbek naraz, więc jeden
 * callback daje jeden wpis historii zawierający pełną, deterministycznie
 * posortowaną listę odrzuconych próbek.
 *
 * Zakres pól jest celowo zamknięty. Nie zapisujemy tu PESEL-u, imienia,
 * nazwiska, danych kontaktowych pacjenta, kodu kreskowego próbki, pełnego
 * payloadu callbacka ani sekretu webhooka.
 */
export interface LabSampleRejectedDetails {
  eventId: string;
  externalOrderId: string;
  rejectedSamples: LabSampleRejectedItem[];
  completedTestCodes: string[];
  rejectedTestCodes: string[];
  previousStatus: OrderStatus;
  newStatus: "REJECTED";
}

/** Pojedynczy błąd pola zgłoszony przez laboratorium przy odrzuceniu zlecenia. */
export interface LabOrderRejectedFieldError {
  field: string;
  code: string;
  message: string;
}

/**
 * Szczegóły synchronicznego odrzucenia zlecenia przez laboratorium przy wysyłce.
 *
 * Zdarzenie nie zmienia statusu zlecenia — odrzucenie walidacyjne jest poprawnym
 * zachowaniem integracji, a nie błędem technicznym, więc `previousStatus` i
 * `newStatus` są równe i pozostają na `SAMPLE_COLLECTED`.
 *
 * Zakres pól jest celowo zamknięty. Nie zapisujemy tu nazwy aktywnego
 * scenariusza symulatora, danych pacjenta, kodów kreskowych, pełnego payloadu
 * wysyłanego do laboratorium ani sekretów integracji.
 */
export interface LabOrderRejectedDetails {
  rejectionType: "VALIDATION";
  errorCode: "LAB_ORDER_VALIDATION_ERROR";
  fieldErrors: LabOrderRejectedFieldError[];
  previousStatus: "SAMPLE_COLLECTED";
  newStatus: "SAMPLE_COLLECTED";
}

/**
 * Szczegóły otrzymania od laboratorium odpowiedzi `429` przy wysyłce zlecenia.
 *
 * Ograniczenie przepustowości jest przejściowe i poprawnie obsługiwane, a nie
 * błędem technicznym: status zlecenia się nie zmienia, więc `previousStatus`
 * i `newStatus` są równe `SAMPLE_COLLECTED`, a zdarzenie NIE jest zapisywane
 * jako `TECHNICAL_ERROR`.
 *
 * Zakres pól jest celowo zamknięty. Nie zapisujemy tu nazwy aktywnego
 * scenariusza symulatora, danych pacjenta, kodów kreskowych, pełnego payloadu
 * wysyłanego do laboratorium ani sekretów integracji.
 */
export interface LabRateLimitReceivedDetails {
  attemptNumber: number;
  retryAfterSeconds: number;
  nextRetryAt: string;
  previousStatus: "SAMPLE_COLLECTED";
  newStatus: "SAMPLE_COLLECTED";
}

/**
 * Szczegóły automatycznego ponowienia wysyłki zakończonego przyjęciem zlecenia.
 *
 * Wpis powstaje wyłącznie dla próby wykonanej przez scheduler, nigdy dla
 * kliknięcia użytkownika — dlatego zapisujemy go z `actorType: SYSTEM`.
 */
export interface LabSendRetryAcceptedDetails {
  attemptNumber: number;
  outcome: "ACCEPTED";
  previousStatus: "SAMPLE_COLLECTED";
  newStatus: "SENT_TO_LAB";
}

/**
 * Szczegóły zaplanowania automatycznego ponowienia po kontrolowanym błędzie
 * laboratorium. Wpis może powstać po pierwszej próbie ręcznej albo po
 * automatycznym ponowieniu, które dostało kolejne `5xx`.
 */
export interface LabSendRetryScheduledDetails {
  attemptNumber: number;
  outcome: "SCHEDULED" | "FAILED_RETRY";
  labStatusCode: 503;
  nextAttemptNumber: number;
  retryAfterSeconds: number;
  nextRetryAt: string;
  previousStatus: "SAMPLE_COLLECTED";
  newStatus: "SAMPLE_COLLECTED";
}

/**
 * Szczegóły automatycznego ponowienia ANULOWANEGO przed wysyłką.
 *
 * Anulowanie następuje, gdy między pierwszą próbą a wykonaniem ponowienia
 * zmieniły się warunki biznesowe (pacjent przestał być aktywny) albo dane objęte
 * hashem żądania wysyłki. Zlecenie nie zmienia statusu, więc `previousStatus`
 * i `newStatus` są równe `SAMPLE_COLLECTED`.
 *
 * `reason` jest zamkniętym kodem technicznym. Wpis nie zawiera danych pacjenta,
 * kodów kreskowych, hashy, payloadu wysyłki ani nazwy scenariusza symulatora.
 */
export interface LabSendRetryCancelledDetails {
  attemptNumber: number;
  outcome: "CANCELLED";
  reason: LabSendRetryCancellationReason;
  previousStatus: "SAMPLE_COLLECTED";
  newStatus: "SAMPLE_COLLECTED";
}

/** Szczegóły wyczerpania automatycznych ponowień wysyłki. */
export interface LabSendRetryExhaustedDetails {
  attemptNumber: number;
  outcome: "EXHAUSTED";
  labStatusCode: 503;
  previousStatus: "SAMPLE_COLLECTED";
  newStatus: "TECHNICAL_ERROR";
}

export type LabSendRetryDetails =
  | LabSendRetryAcceptedDetails
  | LabSendRetryScheduledDetails
  | LabSendRetryCancelledDetails
  | LabSendRetryExhaustedDetails;

/**
 * Szczegóły terminalnego błędu technicznego zlecenia.
 */
export interface TechnicalErrorDetails {
  reason: string;
  attemptNumber?: number;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
}

export function buildOrderCreatedDetails(input: {
  priority: "ROUTINE" | "URGENT";
  testCodes: string[];
  requiredMaterials: OrderMaterialType[];
  finalStatus: OrderStatus;
}): OrderCreatedDetails {
  return {
    priority: input.priority,
    testCodes: [...input.testCodes].sort(),
    requiredMaterials: input.requiredMaterials,
    finalStatus: input.finalStatus
  };
}

export function buildOrderUpdatedDetails(input: {
  patientChanged: boolean;
  priorityChanged: boolean;
  previousPriority: "ROUTINE" | "URGENT";
  newPriority: "ROUTINE" | "URGENT";
  previousTestCodes: string[];
  nextTestCodes: string[];
}): OrderUpdatedDetails {
  const { added, removed } = diffTestCodes(
    input.previousTestCodes,
    input.nextTestCodes
  );
  const testsChanged = added.length > 0 || removed.length > 0;

  const changedFields: OrderHistoryChangedField[] = [];
  if (input.patientChanged) {
    changedFields.push("patientId");
  }
  if (input.priorityChanged) {
    changedFields.push("priority");
  }
  if (testsChanged) {
    changedFields.push("tests");
  }

  return {
    changedFields,
    patientChanged: input.patientChanged,
    ...(input.priorityChanged
      ? { previousPriority: input.previousPriority, newPriority: input.newPriority }
      : {}),
    addedTestCodes: added,
    removedTestCodes: removed
  };
}

export function diffTestCodes(
  previousTestCodes: string[],
  nextTestCodes: string[]
): { added: string[]; removed: string[] } {
  const previousSet = new Set(previousTestCodes);
  const nextSet = new Set(nextTestCodes);

  return {
    added: [...nextSet].filter((code) => !previousSet.has(code)).sort(),
    removed: [...previousSet].filter((code) => !nextSet.has(code)).sort()
  };
}

export function buildSampleRegisteredDetails(input: {
  materialType: OrderMaterialType;
  sampleId: string;
  previousOrderStatus: OrderStatus;
  newOrderStatus: OrderStatus;
}): SampleRegisteredDetails {
  return {
    materialType: input.materialType,
    sampleId: input.sampleId,
    previousOrderStatus: input.previousOrderStatus,
    newOrderStatus: input.newOrderStatus
  };
}

export function buildOrderSentToLabDetails(input: {
  idempotencyKey: string;
  correlationId: string | null;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
}): OrderSentToLabDetails {
  return {
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    previousStatus: input.previousStatus,
    newStatus: input.newStatus
  };
}

export function buildLabOrderAcceptedDetails(input: {
  externalOrderId: string;
  estimatedCompletionAt: string;
}): LabOrderAcceptedDetails {
  return {
    externalOrderId: input.externalOrderId,
    estimatedCompletionAt: input.estimatedCompletionAt
  };
}

export function buildLabResultReceivedDetails(input: {
  eventId: string;
  externalOrderId: string;
  callbackStatus: "PARTIAL" | "COMPLETED";
  testCodes: string[];
  resultCount: number;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
}): LabResultReceivedDetails {
  return {
    eventId: input.eventId,
    externalOrderId: input.externalOrderId,
    callbackStatus: input.callbackStatus,
    resultCount: input.resultCount,
    testCodes: [...input.testCodes].sort(),
    previousStatus: input.previousStatus,
    newStatus: input.newStatus
  };
}

/**
 * Buduje szczegóły zdarzenia `LAB_SAMPLE_REJECTED` z kompletu odrzuconych
 * próbek. Lista jest sortowana po `sampleId`, więc ten sam callback zawsze daje
 * ten sam, stabilny zapis w historii — niezależnie od kolejności w payloadzie.
 * Każdy element jest przepisywany pole po polu, żeby żadna dodatkowa wartość
 * z payloadu callbacka nie trafiła do publicznej historii.
 */
export function buildLabSampleRejectedDetails(input: {
  eventId: string;
  externalOrderId: string;
  rejectedSamples: LabSampleRejectedItem[];
  completedTestCodes: string[];
  rejectedTestCodes: string[];
  previousStatus: OrderStatus;
  newStatus: "REJECTED";
}): LabSampleRejectedDetails {
  return {
    eventId: input.eventId,
    externalOrderId: input.externalOrderId,
    rejectedSamples: [...input.rejectedSamples]
      .sort((left, right) => left.sampleId.localeCompare(right.sampleId))
      .map((sample) => ({
        sampleId: sample.sampleId,
        materialType: sample.materialType,
        rejectionCode: sample.rejectionCode,
        rejectionReason: sample.rejectionReason
      })),
    completedTestCodes: [...input.completedTestCodes].sort(),
    rejectedTestCodes: [...input.rejectedTestCodes].sort(),
    previousStatus: input.previousStatus,
    newStatus: input.newStatus
  };
}

/**
 * Buduje bezpieczne szczegóły zdarzenia `LAB_ORDER_REJECTED`.
 *
 * Każdy błąd pola jest przepisywany pole po polu, więc żadna dodatkowa wartość
 * z wewnętrznego wyniku symulatora nie może trafić do publicznej historii.
 * Kolejność listy jest stabilizowana sortowaniem po `field`, a następnie po
 * `code`, żeby ten sam błąd zawsze dawał ten sam zapis.
 */
export function buildLabOrderRejectedDetails(input: {
  fieldErrors: LabOrderRejectedFieldError[];
}): LabOrderRejectedDetails {
  return {
    rejectionType: "VALIDATION",
    errorCode: "LAB_ORDER_VALIDATION_ERROR",
    fieldErrors: [...input.fieldErrors]
      .sort(
        (left, right) =>
          left.field.localeCompare(right.field) || left.code.localeCompare(right.code)
      )
      .map((fieldError) => ({
        field: fieldError.field,
        code: fieldError.code,
        message: fieldError.message
      })),
    previousStatus: "SAMPLE_COLLECTED",
    newStatus: "SAMPLE_COLLECTED"
  };
}

/**
 * Buduje bezpieczne szczegóły zdarzenia `LAB_RATE_LIMIT_RECEIVED`.
 *
 * Wartości są przepisywane pole po polu — do publicznej historii nie może
 * trafić nic spoza tego kontraktu, w szczególności nazwa aktywnego scenariusza
 * symulatora. `nextRetryAt` jest zapisywany jako ISO 8601, żeby wpis historii
 * był niezależny od strefy czasowej odczytu.
 */
export function buildLabRateLimitReceivedDetails(input: {
  attemptNumber: number;
  retryAfterSeconds: number;
  nextRetryAt: Date;
}): LabRateLimitReceivedDetails {
  return {
    attemptNumber: input.attemptNumber,
    retryAfterSeconds: input.retryAfterSeconds,
    nextRetryAt: input.nextRetryAt.toISOString(),
    previousStatus: "SAMPLE_COLLECTED",
    newStatus: "SAMPLE_COLLECTED"
  };
}

/**
 * Buduje bezpieczne szczegóły zdarzenia `LAB_SEND_RETRY`.
 *
 * Zdarzenie opisuje wyłącznie fakt automatycznego ponowienia i jego wynik.
 * Nie zawiera nazwy scenariusza, danych pacjenta ani payloadu wysyłki.
 */
export function buildLabSendRetryDetails(input: {
  attemptNumber: number;
}): LabSendRetryAcceptedDetails {
  return {
    attemptNumber: input.attemptNumber,
    outcome: "ACCEPTED",
    previousStatus: "SAMPLE_COLLECTED",
    newStatus: "SENT_TO_LAB"
  };
}

export function buildLabSendRetryScheduledDetails(input: {
  attemptNumber: number;
  nextAttemptNumber: number;
  retryAfterSeconds: number;
  nextRetryAt: Date;
}): LabSendRetryScheduledDetails {
  return {
    attemptNumber: input.attemptNumber,
    outcome: "SCHEDULED",
    labStatusCode: 503,
    nextAttemptNumber: input.nextAttemptNumber,
    retryAfterSeconds: input.retryAfterSeconds,
    nextRetryAt: input.nextRetryAt.toISOString(),
    previousStatus: "SAMPLE_COLLECTED",
    newStatus: "SAMPLE_COLLECTED"
  };
}

export function buildLabSendRetryFailedDetails(input: {
  attemptNumber: number;
  nextAttemptNumber: number;
  retryAfterSeconds: number;
  nextRetryAt: Date;
}): LabSendRetryScheduledDetails {
  return {
    attemptNumber: input.attemptNumber,
    outcome: "FAILED_RETRY",
    labStatusCode: 503,
    nextAttemptNumber: input.nextAttemptNumber,
    retryAfterSeconds: input.retryAfterSeconds,
    nextRetryAt: input.nextRetryAt.toISOString(),
    previousStatus: "SAMPLE_COLLECTED",
    newStatus: "SAMPLE_COLLECTED"
  };
}

/**
 * Buduje bezpieczne szczegóły ANULOWANEGO automatycznego ponowienia.
 *
 * Zapisujemy wyłącznie numer próby i zamknięty kod przyczyny — nigdy danych
 * pacjenta, hasha żądania, kodów kreskowych ani payloadu wysyłki. Anulowanie nie
 * zmienia statusu zlecenia, więc oba pola statusu zostają na `SAMPLE_COLLECTED`.
 */
export function buildLabSendRetryCancelledDetails(input: {
  attemptNumber: number;
  reason: LabSendRetryCancellationReason;
}): LabSendRetryCancelledDetails {
  return {
    attemptNumber: input.attemptNumber,
    outcome: "CANCELLED",
    reason: input.reason,
    previousStatus: "SAMPLE_COLLECTED",
    newStatus: "SAMPLE_COLLECTED"
  };
}

export function buildLabSendRetryExhaustedDetails(input: {
  attemptNumber: number;
}): LabSendRetryExhaustedDetails {
  return {
    attemptNumber: input.attemptNumber,
    outcome: "EXHAUSTED",
    labStatusCode: 503,
    previousStatus: "SAMPLE_COLLECTED",
    newStatus: "TECHNICAL_ERROR"
  };
}

export function buildTechnicalErrorDetails(input: {
  reason: string;
  attemptNumber?: number;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
}): TechnicalErrorDetails {
  return {
    reason: input.reason,
    ...(input.attemptNumber !== undefined ? { attemptNumber: input.attemptNumber } : {}),
    previousStatus: input.previousStatus,
    newStatus: input.newStatus
  };
}
