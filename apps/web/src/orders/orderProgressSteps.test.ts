import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@klinika/api-contracts";
import { getOrderProgressSteps } from "./orderProgressSteps";

describe("getOrderProgressSteps", () => {
  it.each<[OrderStatus, string[]]>([
    ["DRAFT", ["current", "pending", "pending", "pending"]],
    ["SAMPLE_COLLECTION_IN_PROGRESS", ["done", "current", "pending", "pending"]],
    ["SAMPLE_COLLECTED", ["done", "done", "current", "pending"]],
    ["SENT_TO_LAB", ["done", "done", "current", "pending"]],
    ["PROCESSING", ["done", "done", "current", "pending"]],
    ["PARTIAL", ["done", "done", "done", "current"]],
    ["COMPLETED", ["done", "done", "done", "done"]],
    ["REJECTED", ["done", "done", "error", "error"]],
    ["TECHNICAL_ERROR", ["done", "done", "error", "error"]]
  ])("mapuje status %s na etapy %j", (status, expectedStates) => {
    const steps = getOrderProgressSteps(status);
    expect(steps.map((step) => step.state)).toEqual(expectedStates);
    expect(steps.map((step) => step.label)).toEqual([
      "Zlecenie",
      "Próbki",
      "Laboratorium",
      "Wynik"
    ]);
  });

  it("nigdy nie oznacza REJECTED ani TECHNICAL_ERROR jako pełnego sukcesu", () => {
    for (const status of ["REJECTED", "TECHNICAL_ERROR"] as const) {
      const states = getOrderProgressSteps(status).map((step) => step.state);
      expect(states).not.toEqual(["done", "done", "done", "done"]);
      expect(states.filter((state) => state === "error").length).toBeGreaterThan(0);
    }
  });
});
