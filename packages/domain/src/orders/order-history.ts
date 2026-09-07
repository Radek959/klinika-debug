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

export interface LabOrderAcceptedDetails {
  externalOrderId: string;
  estimatedCompletionAt: string;
  scenario: string;
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

/**
 * Szczegóły zdarzenia odrzucenia próbki przez laboratorium.
 *
 * Zakres pól jest celowo zamknięty. Nie zapisujemy tu PESEL-u, imienia,
 * nazwiska, danych kontaktowych pacjenta, kodu kreskowego próbki, pełnego
 * payloadu callbacka ani sekretu webhooka.
 */
export interface LabSampleRejectedDetails {
  eventId: string;
  externalOrderId: string;
  materialType: OrderMaterialType;
  sampleId: string;
  rejectionCode: string;
  rejectionReason: string;
  completedTestCodes: string[];
  rejectedTestCodes: string[];
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
}

/**
 * Definiowany na wypadek wystąpienia błędu technicznego w obsługiwanym obecnie procesie.
 * Żaden zaimplementowany obecnie przepływ nie ustawia jeszcze statusu TECHNICAL_ERROR
 * (pełne reguły retry są zaplanowane w Etapie 4), więc ten typ szczegółów nie jest jeszcze
 * emitowany przez kod produkcyjny.
 */
export interface TechnicalErrorDetails {
  reason: string;
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
  scenario: string;
}): LabOrderAcceptedDetails {
  return {
    externalOrderId: input.externalOrderId,
    estimatedCompletionAt: input.estimatedCompletionAt,
    scenario: input.scenario
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

export function buildLabSampleRejectedDetails(input: {
  eventId: string;
  externalOrderId: string;
  materialType: OrderMaterialType;
  sampleId: string;
  rejectionCode: string;
  rejectionReason: string;
  completedTestCodes: string[];
  rejectedTestCodes: string[];
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
}): LabSampleRejectedDetails {
  return {
    eventId: input.eventId,
    externalOrderId: input.externalOrderId,
    materialType: input.materialType,
    sampleId: input.sampleId,
    rejectionCode: input.rejectionCode,
    rejectionReason: input.rejectionReason,
    completedTestCodes: [...input.completedTestCodes].sort(),
    rejectedTestCodes: [...input.rejectedTestCodes].sort(),
    previousStatus: input.previousStatus,
    newStatus: input.newStatus
  };
}
