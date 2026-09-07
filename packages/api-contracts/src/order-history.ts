import type { MaterialType, OrderPriority, OrderStatus } from "./tests-catalog";

export type OrderHistoryEventType =
  | "ORDER_CREATED"
  | "ORDER_UPDATED"
  | "SAMPLE_REGISTERED"
  | "ORDER_SENT_TO_LAB"
  | "LAB_ORDER_ACCEPTED"
  | "LAB_RESULT_RECEIVED"
  | "LAB_SAMPLE_REJECTED"
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

export interface LabOrderAcceptedHistoryDetails {
  externalOrderId: string;
  estimatedCompletionAt: string;
  scenario: string;
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

/**
 * Szczegóły zdarzenia odrzucenia próbki przez laboratorium.
 *
 * Zakres pól jest celowo zamknięty i nie zawiera danych pacjenta, kodu
 * kreskowego próbki, pełnego payloadu callbacka ani sekretu webhooka.
 */
export interface LabSampleRejectedHistoryDetails {
  eventId: string;
  externalOrderId: string;
  materialType: MaterialType;
  sampleId: string;
  rejectionCode: string;
  rejectionReason: string;
  completedTestCodes: string[];
  rejectedTestCodes: string[];
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
}

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
