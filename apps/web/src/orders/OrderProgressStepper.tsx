import type { OrderStatus } from "@klinika/api-contracts";
import { getOrderProgressSteps, type OrderProgressStepState } from "./orderProgressSteps";

const STEP_SYMBOLS: Record<OrderProgressStepState, string> = {
  done: "✓",
  current: "●",
  pending: "○",
  error: "✕"
};

const STEP_STATE_DESCRIPTIONS: Record<OrderProgressStepState, string> = {
  done: "zakończono",
  current: "w trakcie",
  pending: "oczekuje",
  error: "błąd"
};

export function OrderProgressStepper({ status }: { status: OrderStatus }) {
  const steps = getOrderProgressSteps(status);

  return (
    <ol className="order-progress-stepper" aria-label="Postęp zlecenia">
      {steps.map((step) => (
        <li
          key={step.key}
          className={`order-progress-step order-progress-step-${step.state}`}
        >
          <span className="order-progress-step-symbol" aria-hidden="true">
            {STEP_SYMBOLS[step.state]}
          </span>
          <span className="order-progress-step-label">
            {step.label}
            <span className="order-progress-step-state">
              {" "}
              ({STEP_STATE_DESCRIPTIONS[step.state]})
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
