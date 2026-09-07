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
  it("traktuje tylko COMPLETED i REJECTED jako statusy końcowe", () => {
    const finalStatuses = statuses.filter(
      (status) => ORDER_STATUS_TRANSITIONS[status].length === 0
    );

    expect(finalStatuses).toEqual(["COMPLETED", "REJECTED"]);
    expect(ORDER_STATUS_TRANSITIONS.TECHNICAL_ERROR).not.toEqual([]);
  });

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

  it("pozwala wrócić z TECHNICAL_ERROR do procesu integracji", () => {
    expect(ORDER_STATUS_TRANSITIONS.TECHNICAL_ERROR).toEqual([
      "SENT_TO_LAB",
      "PROCESSING",
      "PARTIAL",
      "COMPLETED",
      "REJECTED"
    ]);
    for (const target of ORDER_STATUS_TRANSITIONS.TECHNICAL_ERROR) {
      expect(canTransitionOrderStatus("TECHNICAL_ERROR", target)).toBe(true);
    }
  });

  it("pozwala oznaczyć zlecenie jako TECHNICAL_ERROR przed przyjęciem przez laboratorium", () => {
    expect(canTransitionOrderStatus("SAMPLE_COLLECTED", "TECHNICAL_ERROR")).toBe(true);
  });

  it("odrzuca powrót z TECHNICAL_ERROR do pobierania próbek", () => {
    expect(canTransitionOrderStatus("TECHNICAL_ERROR", "DRAFT")).toBe(false);
    expect(
      canTransitionOrderStatus(
        "TECHNICAL_ERROR",
        "SAMPLE_COLLECTION_IN_PROGRESS"
      )
    ).toBe(false);
    expect(canTransitionOrderStatus("TECHNICAL_ERROR", "SAMPLE_COLLECTED")).toBe(
      false
    );
  });

  it("traktuje COMPLETED i REJECTED jako bez dalszych przejść", () => {
    expect(ORDER_STATUS_TRANSITIONS.COMPLETED).toEqual([]);
    expect(ORDER_STATUS_TRANSITIONS.REJECTED).toEqual([]);
    expect(canTransitionOrderStatus("COMPLETED", "PROCESSING")).toBe(false);
    expect(canTransitionOrderStatus("REJECTED", "TECHNICAL_ERROR")).toBe(false);
  });

  it("pozwala na powtórne przejście PARTIAL do PARTIAL", () => {
    expect(canTransitionOrderStatus("PARTIAL", "PARTIAL")).toBe(true);
  });
});
