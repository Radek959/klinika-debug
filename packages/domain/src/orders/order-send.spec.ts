import { canSendOrder, buildSendIdempotencyKey } from "./order-send";
import type { OrderStatus } from "./order-status";

describe("order send domain", () => {
  describe("canSendOrder", () => {
    it("pozwala wysłać zlecenie wyłącznie w statusie SAMPLE_COLLECTED", () => {
      const statuses: OrderStatus[] = [
        "DRAFT",
        "SAMPLE_COLLECTION_IN_PROGRESS",
        "SAMPLE_COLLECTED",
        "SENT_TO_LAB",
        "PROCESSING",
        "PARTIAL",
        "COMPLETED",
        "REJECTED",
        "TECHNICAL_ERROR"
      ];

      const allowed = statuses.filter((status) => canSendOrder(status));
      expect(allowed).toEqual(["SAMPLE_COLLECTED"]);
    });
  });

  describe("buildSendIdempotencyKey", () => {
    it("zwraca deterministyczny klucz na podstawie identyfikatora zlecenia", () => {
      expect(buildSendIdempotencyKey("order-1")).toBe("send-order-1");
      expect(buildSendIdempotencyKey("order-1")).toBe(
        buildSendIdempotencyKey("order-1")
      );
    });

    it("zwraca różne klucze dla różnych zleceń", () => {
      expect(buildSendIdempotencyKey("order-1")).not.toBe(
        buildSendIdempotencyKey("order-2")
      );
    });
  });
});
