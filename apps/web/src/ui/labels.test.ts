import { describe, expect, it } from "vitest";
import {
  orderPriorityBadgeVariants,
  orderStatusBadgeVariants,
  statusBadgeClassName
} from "./labels";

describe("statusBadgeClassName", () => {
  it("łączy bazową klasę z wariantem", () => {
    expect(statusBadgeClassName("success")).toBe("status-badge status-badge-success");
    expect(statusBadgeClassName("error")).toBe("status-badge status-badge-error");
  });
});

describe("mapowanie wariantów statusów zleceń", () => {
  it("grupuje statusy zgodnie z ich znaczeniem, nie pojedynczo", () => {
    expect(orderStatusBadgeVariants.COMPLETED).toBe("success");
    expect(orderStatusBadgeVariants.REJECTED).toBe("error");
    expect(orderStatusBadgeVariants.TECHNICAL_ERROR).toBe("error");
    expect(orderStatusBadgeVariants.DRAFT).toBe("neutral");
    for (const pendingStatus of [
      "SAMPLE_COLLECTION_IN_PROGRESS",
      "SAMPLE_COLLECTED",
      "SENT_TO_LAB",
      "PROCESSING",
      "PARTIAL"
    ] as const) {
      expect(orderStatusBadgeVariants[pendingStatus]).toBe("pending");
    }
  });

  it("wyróżnia priorytet PILNE jako ostrzeżenie", () => {
    expect(orderPriorityBadgeVariants.URGENT).toBe("warning");
    expect(orderPriorityBadgeVariants.ROUTINE).toBe("neutral");
  });
});
