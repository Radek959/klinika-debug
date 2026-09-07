import type { MaterialType, OrderPriority, OrderStatus } from "./tests-catalog";

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

export interface OrderCreatedHistoryDetails {
  reconstructed?: true;
  priority?: OrderPriority;
  testCodes?: string[];
  requiredMaterials?: MaterialType[];
  finalStatus?: OrderStatus;
}

export interface OrderUpdatedHistoryDetails {
  changedFields: OrderHistoryChangedField[];
  patientChanged: boolean;
  previousPriority?: OrderPriority;
  newPriority?: OrderPriority;
  addedTestCodes: string[];
  removedTestCodes: string[];
}

export interface SampleRegisteredHistoryDetails {
  materialType: MaterialType;
  sampleId: string;
  previousOrderStatus: OrderStatus;
  newOrderStatus: OrderStatus;
}

export interface OrderSentToLabHistoryDetails {
  idempotencyKey: string;
  correlationId: string | null;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
}

/**
 * Szczegóły synchronicznego przyjęcia zlecenia przez laboratorium.
 *
 * Kontrakt celowo nie zawiera nazwy aktywnego scenariusza symulatora — jest to
 * wewnętrzny tryb środowiska warsztatowego, którego uczestnik nie może odczytać
 * z publicznego API.
 */
export interface LabOrderAcceptedHistoryDetails {
  externalOrderId: string;
  estimatedCompletionAt: string;
}

export interface LabResultReceivedHistoryDetails {
  eventId: string;
  externalOrderId: string;
  callbackStatus: "PARTIAL" | "COMPLETED";
  resultCount: number;
  testCodes: string[];
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
}

/** Pojedyncza próbka odrzucona przez laboratorium w danym callbacku. */
export interface LabSampleRejectedHistoryItem {
  sampleId: string;
  materialType: MaterialType;
  rejectionCode: string;
  rejectionReason: string;
}

/**
 * Szczegóły zdarzenia odrzucenia próbek przez laboratorium.
 *
 * Jeden callback daje jeden wpis historii zawierający komplet odrzuconych
 * próbek. Zakres pól jest celowo zamknięty i nie zawiera danych pacjenta, kodu
 * kreskowego próbki, pełnego payloadu callbacka ani sekretu webhooka.
 */
export interface LabSampleRejectedHistoryDetails {
  eventId: string;
  externalOrderId: string;
  rejectedSamples: LabSampleRejectedHistoryItem[];
  completedTestCodes: string[];
  rejectedTestCodes: string[];
  previousStatus: OrderStatus;
  newStatus: "REJECTED";
}

/** Pojedynczy błąd pola zgłoszony przez laboratorium przy odrzuceniu zlecenia. */
export interface LabOrderRejectedHistoryFieldError {
  field: string;
  code: string;
  message: string;
}

/**
 * Szczegóły synchronicznego odrzucenia zlecenia przez laboratorium przy wysyłce.
 *
 * Odrzucenie walidacyjne jest poprawnym zachowaniem integracji, a nie błędem
 * technicznym: status zlecenia się nie zmienia, więc `previousStatus` i
 * `newStatus` są równe `SAMPLE_COLLECTED`. Kontrakt nie zawiera nazwy aktywnego
 * scenariusza symulatora, danych pacjenta, kodów kreskowych ani payloadu
 * wysyłanego do laboratorium.
 */
export interface LabOrderRejectedHistoryDetails {
  rejectionType: "VALIDATION";
  errorCode: "LAB_ORDER_VALIDATION_ERROR";
  fieldErrors: LabOrderRejectedHistoryFieldError[];
  previousStatus: "SAMPLE_COLLECTED";
  newStatus: "SAMPLE_COLLECTED";
}

/**
 * Szczegóły otrzymania od laboratorium odpowiedzi `429` przy wysyłce zlecenia.
 *
 * Ograniczenie przepustowości jest przejściowe: zlecenie zostaje w statusie
 * `SAMPLE_COLLECTED`, a Klinika Debug planuje automatyczne ponowienie wysyłki.
 * Kontrakt nie zawiera nazwy aktywnego scenariusza symulatora, danych pacjenta
 * ani kodów kreskowych.
 */
export interface LabRateLimitReceivedHistoryDetails {
  attemptNumber: number;
  retryAfterSeconds: number;
  nextRetryAt: string;
  previousStatus: "SAMPLE_COLLECTED";
  newStatus: "SAMPLE_COLLECTED";
}

/**
 * Bezpieczny kod przyczyny anulowania automatycznego ponowienia wysyłki.
 *
 * `PATIENT_INACTIVE` — pacjent przestał być aktywny po pierwszej próbie.
 * `REQUEST_CHANGED` — dane zlecenia objęte hashem żądania wysyłki zmieniły się
 * po pierwszej próbie.
 */
export type LabSendRetryCancellationReason = "PATIENT_INACTIVE" | "REQUEST_CHANGED";

/**
 * Szczegóły automatycznego ponowienia wysyłki zakończonego przyjęciem zlecenia.
 *
 * Wpis dotyczy wyłącznie próby wykonanej automatycznie przez Klinikę Debug,
 * dlatego jego `actorType` to `SYSTEM`, a nie `STAFF`.
 */
export interface LabSendRetryAcceptedHistoryDetails {
  attemptNumber: number;
  outcome: "ACCEPTED";
  previousStatus: "SAMPLE_COLLECTED";
  newStatus: "SENT_TO_LAB";
}

/**
 * Szczegóły automatycznego ponowienia ANULOWANEGO przed wysyłką.
 *
 * Anulowanie oznacza, że zlecenie NIE zostało wysłane: warunki biznesowe albo
 * dane objęte hashem zmieniły się od pierwszej próby, więc status zlecenia
 * pozostaje `SAMPLE_COLLECTED`. Kontrakt nie zawiera danych pacjenta, hasha
 * żądania, kodów kreskowych ani nazwy scenariusza symulatora.
 */
export interface LabSendRetryCancelledHistoryDetails {
  attemptNumber: number;
  outcome: "CANCELLED";
  reason: LabSendRetryCancellationReason;
  previousStatus: "SAMPLE_COLLECTED";
  newStatus: "SAMPLE_COLLECTED";
}

export type LabSendRetryHistoryDetails =
  | LabSendRetryAcceptedHistoryDetails
  | LabSendRetryCancelledHistoryDetails;

export interface TechnicalErrorHistoryDetails {
  reason: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
}

export type OrderHistoryEventDetails =
  | ({ eventType: "ORDER_CREATED" } & OrderCreatedHistoryDetails)
  | ({ eventType: "ORDER_UPDATED" } & OrderUpdatedHistoryDetails)
  | ({ eventType: "SAMPLE_REGISTERED" } & SampleRegisteredHistoryDetails)
  | ({ eventType: "ORDER_SENT_TO_LAB" } & OrderSentToLabHistoryDetails)
  | ({ eventType: "LAB_ORDER_ACCEPTED" } & LabOrderAcceptedHistoryDetails)
  | ({ eventType: "LAB_RESULT_RECEIVED" } & LabResultReceivedHistoryDetails)
  | ({ eventType: "LAB_SAMPLE_REJECTED" } & LabSampleRejectedHistoryDetails)
  | ({ eventType: "LAB_ORDER_REJECTED" } & LabOrderRejectedHistoryDetails)
  | ({ eventType: "LAB_RATE_LIMIT_RECEIVED" } & LabRateLimitReceivedHistoryDetails)
  | ({ eventType: "LAB_SEND_RETRY" } & LabSendRetryHistoryDetails)
  | ({ eventType: "TECHNICAL_ERROR" } & TechnicalErrorHistoryDetails);

export interface OrderHistoryItem {
  id: string;
  eventType: OrderHistoryEventType;
  occurredAt: string;
  actorType: OrderHistoryActorType;
  actorUserId: string | null;
  actorDisplayName: string | null;
  correlationId: string | null;
  integrationEventId: string | null;
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus | null;
  details: OrderHistoryEventDetails;
}

export interface OrderHistoryListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface OrderHistoryListResponse {
  items: OrderHistoryItem[];
  meta: OrderHistoryListMeta;
}

export interface OrderHistoryListParams {
  page?: number;
  pageSize?: number;
}
