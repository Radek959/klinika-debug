import type {
  CreateOrderRequest,
  MedicalTestCatalogItem,
  MaterialType,
  OrderAdditionalDataValue,
  OrderPriority,
  PatientListItem
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
}): CreateOrderRequest {
  return {
    patientId: input.patientId,
    priority: input.priority,
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
