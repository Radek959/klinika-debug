import type { OrderStatus } from "@klinika/api-contracts";

export type OrderProgressStepState = "done" | "current" | "pending" | "error";

export interface OrderProgressStep {
  key: "order" | "samples" | "lab" | "result";
  label: string;
  state: OrderProgressStepState;
}

const STEP_LABELS: Record<OrderProgressStep["key"], string> = {
  order: "Zlecenie",
  samples: "Próbki",
  lab: "Laboratorium",
  result: "Wynik"
};

/**
 * Jedno jawne mapowanie statusu zlecenia na stan czterech etapów procesu.
 * `REJECTED` i `TECHNICAL_ERROR` oznaczają błąd na etapie laboratorium — oba
 * etapy „Laboratorium” i „Wynik” dostają stan `error`, nigdy `done`, żeby nie
 * wyglądały jak pełny sukces.
 */
const STEP_STATES_BY_STATUS: Record<OrderStatus, OrderProgressStepState[]> = {
  DRAFT: ["current", "pending", "pending", "pending"],
  SAMPLE_COLLECTION_IN_PROGRESS: ["done", "current", "pending", "pending"],
  SAMPLE_COLLECTED: ["done", "done", "current", "pending"],
  SENT_TO_LAB: ["done", "done", "current", "pending"],
  PROCESSING: ["done", "done", "current", "pending"],
  PARTIAL: ["done", "done", "done", "current"],
  COMPLETED: ["done", "done", "done", "done"],
  REJECTED: ["done", "done", "error", "error"],
  TECHNICAL_ERROR: ["done", "done", "error", "error"]
};

export function getOrderProgressSteps(status: OrderStatus): OrderProgressStep[] {
  const states = STEP_STATES_BY_STATUS[status];
  const keys: OrderProgressStep["key"][] = ["order", "samples", "lab", "result"];
  return keys.map((key, index) => ({
    key,
    label: STEP_LABELS[key],
    state: states[index]
  }));
}
