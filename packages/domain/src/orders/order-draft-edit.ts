import type {
  NormalizedOrderTestSelection,
  OrderAdditionalData,
  OrderAdditionalDataValue,
  OrderValidationFieldError
} from "./order-creation";
import type { OrderStatus } from "./order-status";

export interface DraftOrderState {
  patientId: string;
  priority: "ROUTINE" | "URGENT";
  tests: NormalizedOrderTestSelection[];
}

export interface DraftOrderPatch {
  patientId?: string;
  priority?: "ROUTINE" | "URGENT";
  tests?: NormalizedOrderTestSelection[];
}

export interface DraftOrderChangeSet {
  patientChanged: boolean;
  priorityChanged: boolean;
  testsChanged: boolean;
}

export function canEditDraftOrder(status: OrderStatus) {
  return status === "DRAFT";
}

export function mergeDraftOrderPatch(
  current: DraftOrderState,
  patch: DraftOrderPatch
): DraftOrderState {
  return {
    patientId: patch.patientId ?? current.patientId,
    priority: patch.priority ?? current.priority,
    tests: patch.tests ?? current.tests
  };
}

export function getDraftOrderChangeSet(
  current: DraftOrderState,
  next: DraftOrderState
): DraftOrderChangeSet {
  return {
    patientChanged: current.patientId !== next.patientId,
    priorityChanged: current.priority !== next.priority,
    testsChanged: !areNormalizedTestsEqual(current.tests, next.tests)
  };
}

export function hasDraftOrderChanges(changes: DraftOrderChangeSet) {
  return changes.patientChanged || changes.priorityChanged || changes.testsChanged;
}

export function validateDraftOrderPatchHasChanges(
  current: DraftOrderState,
  next: DraftOrderState
): OrderValidationFieldError[] {
  return hasDraftOrderChanges(getDraftOrderChangeSet(current, next))
    ? []
    : [{ field: "body", code: "NO_CHANGES" as OrderValidationFieldError["code"] }];
}

function areNormalizedTestsEqual(
  left: NormalizedOrderTestSelection[],
  right: NormalizedOrderTestSelection[]
) {
  return serializeTests(left) === serializeTests(right);
}

function serializeTests(tests: NormalizedOrderTestSelection[]) {
  return JSON.stringify(
    tests
      .map((test) => ({
        medicalTestId: test.medicalTestId,
        additionalData: normalizeAdditionalData(test.additionalData)
      }))
      .sort((left, right) => left.medicalTestId.localeCompare(right.medicalTestId))
  );
}

function normalizeAdditionalData(additionalData: OrderAdditionalData | null) {
  if (!additionalData) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(additionalData)
      .filter((entry): entry is [string, OrderAdditionalDataValue] => entry[1] !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}
