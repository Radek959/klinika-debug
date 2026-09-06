import type { OrderStatus } from "./order-status";

export function canSendOrder(status: OrderStatus): boolean {
  return status === "SAMPLE_COLLECTED";
}

export function buildSendIdempotencyKey(orderId: string): string {
  return `send-${orderId}`;
}
