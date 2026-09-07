import type { OrderHistory } from "@prisma/client";
import type {
  OrderHistoryEventDetails,
  OrderHistoryItem,
  OrderHistoryListResponse
} from "@klinika/api-contracts";

type OrderHistoryRow = OrderHistory & {
  actorUser: { displayName: string } | null;
};

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
    details: {
      eventType: row.eventType,
      ...(row.details as Record<string, unknown>)
    } as OrderHistoryEventDetails
  };
}
