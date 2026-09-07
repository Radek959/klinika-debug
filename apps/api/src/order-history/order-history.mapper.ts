import type { OrderHistory, OrderHistoryEventType } from "@prisma/client";
import type {
  OrderHistoryEventDetails,
  OrderHistoryItem,
  OrderHistoryListResponse
} from "@klinika/api-contracts";

type OrderHistoryRow = OrderHistory & {
  actorUser: { displayName: string } | null;
};

/**
 * Jawna lista pól szczegółów dopuszczonych w publicznej odpowiedzi dla każdego
 * typu zdarzenia.
 *
 * Kolumna `details` jest JSON-em zapisanym w przeszłości, więc mapper nie może
 * przepisywać jej spreadem: wiersz zapisany starszą wersją kodu mógłby wtedy
 * wynieść na zewnątrz pole, którego dzisiejszy kontrakt już nie zawiera
 * (np. wewnętrzną nazwę scenariusza symulatora przy `LAB_ORDER_ACCEPTED`).
 * Whitelista jest zdefiniowana dla każdego typu zdarzenia i wszystko spoza niej
 * jest pomijane.
 */
const ALLOWED_DETAILS_FIELDS: Record<OrderHistoryEventType, readonly string[]> = {
  ORDER_CREATED: [
    "reconstructed",
    "priority",
    "testCodes",
    "requiredMaterials",
    "finalStatus"
  ],
  ORDER_UPDATED: [
    "changedFields",
    "patientChanged",
    "previousPriority",
    "newPriority",
    "addedTestCodes",
    "removedTestCodes"
  ],
  SAMPLE_REGISTERED: [
    "materialType",
    "sampleId",
    "previousOrderStatus",
    "newOrderStatus"
  ],
  ORDER_SENT_TO_LAB: [
    "idempotencyKey",
    "correlationId",
    "previousStatus",
    "newStatus"
  ],
  LAB_ORDER_ACCEPTED: ["externalOrderId", "estimatedCompletionAt"],
  LAB_RESULT_RECEIVED: [
    "eventId",
    "externalOrderId",
    "callbackStatus",
    "resultCount",
    "testCodes",
    "previousStatus",
    "newStatus"
  ],
  LAB_SAMPLE_REJECTED: [
    "eventId",
    "externalOrderId",
    "rejectedSamples",
    "completedTestCodes",
    "rejectedTestCodes",
    "previousStatus",
    "newStatus"
  ],
  LAB_ORDER_REJECTED: [
    "rejectionType",
    "errorCode",
    "fieldErrors",
    "previousStatus",
    "newStatus"
  ],
  LAB_RATE_LIMIT_RECEIVED: [
    "attemptNumber",
    "retryAfterSeconds",
    "nextRetryAt",
    "previousStatus",
    "newStatus"
  ],
  LAB_SEND_TIMEOUT_RECEIVED: [
    "attemptNumber",
    "retryAfterSeconds",
    "nextRetryAt",
    "previousStatus",
    "newStatus"
  ],
  // `reason` występuje wyłącznie w wariancie CANCELLED i jest zamkniętym kodem
  // technicznym (PATIENT_INACTIVE, REQUEST_CHANGED), nigdy treścią swobodną.
  LAB_SEND_RETRY: [
    "attemptNumber",
    "outcome",
    "reason",
    "labStatusCode",
    "nextAttemptNumber",
    "retryAfterSeconds",
    "nextRetryAt",
    "previousStatus",
    "newStatus"
  ],
  TECHNICAL_ERROR: ["reason", "attemptNumber", "previousStatus", "newStatus"]
};

/** Pola dopuszczone wewnątrz elementu listy `rejectedSamples`. */
const ALLOWED_REJECTED_SAMPLE_FIELDS = [
  "sampleId",
  "materialType",
  "rejectionCode",
  "rejectionReason"
] as const;

/** Pola dopuszczone wewnątrz elementu listy `fieldErrors`. */
const ALLOWED_FIELD_ERROR_FIELDS = ["field", "code", "message"] as const;

export function toOrderHistoryListResponse(
  rows: OrderHistoryRow[],
  page: number,
  pageSize: number,
  total: number
): OrderHistoryListResponse {
  return {
    items: rows.map(toOrderHistoryItem),
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  };
}

function toOrderHistoryItem(row: OrderHistoryRow): OrderHistoryItem {
  return {
    id: row.id,
    eventType: row.eventType,
    occurredAt: row.occurredAt.toISOString(),
    actorType: row.actorType,
    actorUserId: row.actorUserId,
    actorDisplayName: row.actorUser?.displayName ?? null,
    correlationId: row.correlationId,
    integrationEventId: row.integrationEventId,
    previousStatus: row.previousStatus,
    newStatus: row.newStatus,
    details: sanitizeDetails(row.eventType, row.details)
  };
}

function sanitizeDetails(
  eventType: OrderHistoryEventType,
  rawDetails: unknown
): OrderHistoryEventDetails {
  const stored = pickAllowed(rawDetails, ALLOWED_DETAILS_FIELDS[eventType]);

  if (eventType === "LAB_SAMPLE_REJECTED") {
    stored.rejectedSamples = sanitizeRejectedSamples(stored.rejectedSamples);
  }

  if (eventType === "LAB_ORDER_REJECTED") {
    stored.fieldErrors = sanitizeNestedList(
      stored.fieldErrors,
      ALLOWED_FIELD_ERROR_FIELDS
    );
  }

  return { ...stored, eventType } as OrderHistoryEventDetails;
}

function sanitizeRejectedSamples(value: unknown): Record<string, unknown>[] {
  return sanitizeNestedList(value, ALLOWED_REJECTED_SAMPLE_FIELDS);
}

/**
 * Whitelista musi obowiązywać także wewnątrz zagnieżdżonych list szczegółów —
 * `pickAllowed` przepisuje element tablicy w całości, więc bez tego kroku
 * dodatkowe pole zapisane starszą wersją kodu wyciekłoby do odpowiedzi.
 */
function sanitizeNestedList(
  value: unknown,
  allowedFields: readonly string[]
): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => pickAllowed(item, allowedFields));
}

function pickAllowed(
  value: unknown,
  allowedFields: readonly string[]
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (Object.hasOwn(source, field)) {
      picked[field] = source[field];
    }
  }
  return picked;
}
