import {
  canTransitionOrderStatus,
  ORDER_STATUS_TRANSITIONS,
  type OrderStatus
} from "@klinika/domain";

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

describe("order status domain", () => {
  it("pozwala na wszystkie zdefiniowane przejścia", () => {
    for (const [from, allowedTargets] of Object.entries(
      ORDER_STATUS_TRANSITIONS
    ) as Array<[OrderStatus, readonly OrderStatus[]]>) {
      for (const to of allowedTargets) {
        expect(canTransitionOrderStatus(from, to)).toBe(true);
      }
    }
  });

  it("odrzuca przejścia spoza definicji", () => {
    for (const from of statuses) {
      for (const to of statuses) {
        const expected = ORDER_STATUS_TRANSITIONS[from].includes(to);
        expect(canTransitionOrderStatus(from, to)).toBe(expected);
      }
    }
  });

  it("traktuje statusy końcowe jako bez dalszych przejść", () => {
    expect(ORDER_STATUS_TRANSITIONS.COMPLETED).toEqual([]);
    expect(ORDER_STATUS_TRANSITIONS.REJECTED).toEqual([]);
    expect(canTransitionOrderStatus("COMPLETED", "PROCESSING")).toBe(false);
    expect(canTransitionOrderStatus("REJECTED", "TECHNICAL_ERROR")).toBe(false);
  });

  it("pozwala na powtórne przejście PARTIAL do PARTIAL", () => {
    expect(canTransitionOrderStatus("PARTIAL", "PARTIAL")).toBe(true);
  });
});
