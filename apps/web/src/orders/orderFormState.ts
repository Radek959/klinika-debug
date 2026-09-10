import type {
  CreateOrderRequest,
  MedicalTestCatalogItem,
  MaterialType,
  OrderDetailsResponse,
  OrderAdditionalDataValue,
  OrderPriority,
  PatientListItem,
  UpdateOrderRequest
} from "@klinika/api-contracts";

export interface SelectedOrderTest {
  additionalData: Record<string, OrderAdditionalDataValue>;
}

export type SelectedOrderTests = Record<string, SelectedOrderTest>;

export const materialOrder: MaterialType[] = ["EDTA_BLOOD", "SERUM", "URINE"];

export function createInitialAdditionalData(test: MedicalTestCatalogItem) {
  return test.requiredFields.reduce<Record<string, OrderAdditionalDataValue>>(
    (acc, field) => {
      if (field.valueType === "BOOLEAN") {
        acc[field.code] = false;
      }
      return acc;
    },
    {}
  );
}

export function getSelectedCatalogItems(
  catalog: MedicalTestCatalogItem[],
  selectedTests: SelectedOrderTests
) {
  return catalog.filter((test) => Boolean(selectedTests[test.id]));
}

export function getRequiredMaterials(
  catalog: MedicalTestCatalogItem[],
  selectedTests: SelectedOrderTests
) {
  const selectedMaterials = new Set(
    getSelectedCatalogItems(catalog, selectedTests).map((test) => test.materialType)
  );

  return materialOrder.filter((materialType) => selectedMaterials.has(materialType));
}

export function getMissingRequiredAdditionalFields(
  catalog: MedicalTestCatalogItem[],
  selectedTests: SelectedOrderTests
) {
  return getSelectedCatalogItems(catalog, selectedTests).flatMap((test) => {
    const selection = selectedTests[test.id];
    return test.requiredFields
      .filter((field) => {
        if (!field.required) {
          return false;
        }
        const value = selection?.additionalData[field.code];
        if (field.valueType === "BOOLEAN") {
          return value === undefined || value === null;
        }
        return typeof value !== "string" || value.trim() === "";
      })
      .map((field) => ({ test, field }));
  });
}

export function isOrderFormSubmittable(input: {
  selectedPatient: PatientListItem | null;
  catalog: MedicalTestCatalogItem[];
  selectedTests: SelectedOrderTests;
  isSubmitting: boolean;
}) {
  return (
    Boolean(input.selectedPatient) &&
    getSelectedCatalogItems(input.catalog, input.selectedTests).length > 0 &&
    getMissingRequiredAdditionalFields(input.catalog, input.selectedTests).length === 0 &&
    !input.isSubmitting
  );
}

export function buildCreateOrderPayload(input: {
  patientId: string;
  priority: OrderPriority;
  catalog: MedicalTestCatalogItem[];
  selectedTests: SelectedOrderTests;
  /**
   * WORKSHOP CONTROLLED DEFECT (ORDER_PRIORITY_MAPPING): `true` only when
   * the backend catalog signal (`orderPriorityRoutingActive`, read fresh at
   * submit time — see NewOrderPage.tsx) says the controlled bug is active.
   * Only ever changes `URGENT` ("Pilne") into `ROUTINE`; a `ROUTINE`
   * selection is never touched. Defaults to `false`, so every other caller
   * (edit order, tests here that omit it) keeps sending exactly the
   * selected priority.
   */
  invertUrgentPriority?: boolean;
}): CreateOrderRequest {
  const priority =
    input.invertUrgentPriority && input.priority === "URGENT" ? "ROUTINE" : input.priority;

  return {
    patientId: input.patientId,
    priority,
    tests: getSelectedCatalogItems(input.catalog, input.selectedTests).map((test) => {
      const additionalData = sanitizeAdditionalData(
        input.selectedTests[test.id]?.additionalData ?? {}
      );
      return {
        medicalTestId: test.id,
        additionalData:
          Object.keys(additionalData).length > 0 ? additionalData : undefined
      };
    })
  };
}

export interface OrderFormComparableState {
  patientId: string;
  priority: OrderPriority;
  selectedTests: SelectedOrderTests;
}

export function buildSelectedTestsFromOrder(order: OrderDetailsResponse): SelectedOrderTests {
  return Object.fromEntries(
    order.tests.map((test) => [
      test.medicalTestId,
      { additionalData: test.additionalData ?? {} }
    ])
  );
}

export function buildPatientListItemFromOrder(order: OrderDetailsResponse): PatientListItem {
  return order.patient;
}

export function buildUpdateOrderPayload(input: {
  initial: OrderFormComparableState;
  current: OrderFormComparableState;
  catalog: MedicalTestCatalogItem[];
}): UpdateOrderRequest | null {
  const payload: UpdateOrderRequest = {};

  if (input.initial.patientId !== input.current.patientId) {
    payload.patientId = input.current.patientId;
  }

  if (input.initial.priority !== input.current.priority) {
    payload.priority = input.current.priority;
  }

  if (!areSelectedTestsEqual(input.initial.selectedTests, input.current.selectedTests)) {
    payload.tests = buildCreateOrderPayload({
      patientId: input.current.patientId,
      priority: input.current.priority,
      catalog: input.catalog,
      selectedTests: input.current.selectedTests
    }).tests;
  }

  return Object.keys(payload).length > 0 ? payload : null;
}

export function areSelectedTestsEqual(left: SelectedOrderTests, right: SelectedOrderTests) {
  return serializeSelectedTests(left) === serializeSelectedTests(right);
}

export function sanitizeAdditionalData(
  additionalData: Record<string, OrderAdditionalDataValue>
) {
  return Object.entries(additionalData).reduce<Record<string, OrderAdditionalDataValue>>(
    (acc, [key, value]) => {
      if (typeof value === "boolean") {
        acc[key] = value;
        return acc;
      }
      if (value.trim() !== "") {
        acc[key] = value;
      }
      return acc;
    },
    {}
  );
}

function serializeSelectedTests(selectedTests: SelectedOrderTests) {
  return JSON.stringify(
    Object.entries(selectedTests)
      .map(([medicalTestId, selection]) => ({
        medicalTestId,
        additionalData: Object.fromEntries(
          Object.entries(sanitizeAdditionalData(selection.additionalData)).sort(([left], [right]) =>
            left.localeCompare(right)
          )
        )
      }))
      .sort((left, right) => left.medicalTestId.localeCompare(right.medicalTestId))
  );
}

export function maskPatientIdentifier(patient: Pick<
  PatientListItem,
  | "identifierType"
  | "pesel"
  | "documentType"
  | "documentNumber"
  | "documentCountry"
>) {
  if (patient.identifierType === "PESEL") {
    return patient.pesel ? `PESEL: ******${patient.pesel.slice(-5)}` : "PESEL: nie podano";
  }

  const documentParts = [patient.documentType, patient.documentCountry].filter(Boolean);
  const prefix = documentParts.length ? documentParts.join(" / ") : "Inny dokument";
  const suffix = patient.documentNumber
    ? `końcówka ${patient.documentNumber.slice(-4)}`
    : "numer niepodany";

  return `${prefix}: ${suffix}`;
}

export function patientDisplayName(patient: Pick<PatientListItem, "firstName" | "lastName">) {
  return `${patient.lastName} ${patient.firstName}`;
}

export function formatEstimatedDuration(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) {
    return "Nie podano";
  }

  return `${minutes} min`;
}
