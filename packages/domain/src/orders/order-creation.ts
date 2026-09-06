export type OrderMaterialType = "EDTA_BLOOD" | "SERUM" | "URINE";

export type OrderRequiredFieldValueType = "BOOLEAN" | "TEXT";

export type OrderAdditionalDataValue = boolean | string;
export type OrderAdditionalData = Record<string, OrderAdditionalDataValue>;

export type OrderValidationCode =
  | "PATIENT_INACTIVE"
  | "TESTS_REQUIRED"
  | "DUPLICATE_TEST"
  | "MEDICAL_TEST_NOT_FOUND"
  | "MEDICAL_TEST_INACTIVE"
  | "REQUIRED_ADDITIONAL_DATA"
  | "INVALID_ADDITIONAL_DATA_TYPE"
  | "UNKNOWN_ADDITIONAL_DATA_FIELD";

export interface OrderValidationFieldError {
  field: string;
  code: OrderValidationCode;
}

export interface OrderTestSelectionInput {
  medicalTestId?: string | null;
  additionalData?: Record<string, unknown> | null;
}

export interface OrderRequiredFieldDefinition {
  code: string;
  valueType: OrderRequiredFieldValueType;
  required: boolean;
}

export interface OrderMedicalTestDefinition {
  id: string;
  materialType: OrderMaterialType;
  requiredFields: OrderRequiredFieldDefinition[];
}

export interface NormalizedOrderTestSelection {
  medicalTestId: string;
  additionalData: OrderAdditionalData | null;
}

export type OrderAdditionalDataValidationResult =
  | { valid: true; value: NormalizedOrderTestSelection[] }
  | { valid: false; errors: OrderValidationFieldError[] };

const MATERIAL_ORDER: OrderMaterialType[] = ["EDTA_BLOOD", "SERUM", "URINE"];

export function findDuplicateMedicalTestSelections(
  tests: OrderTestSelectionInput[]
): OrderValidationFieldError[] {
  const firstIndexById = new Map<string, number>();
  const errors: OrderValidationFieldError[] = [];

  for (const [index, test] of tests.entries()) {
    const medicalTestId = test.medicalTestId;
    if (!medicalTestId) {
      continue;
    }
    const firstIndex = firstIndexById.get(medicalTestId);
    if (firstIndex !== undefined) {
      errors.push({
        field: `tests.${index}.medicalTestId`,
        code: "DUPLICATE_TEST"
      });
      continue;
    }
    firstIndexById.set(medicalTestId, index);
  }

  return errors;
}

export function calculateRequiredMaterials(
  tests: OrderMedicalTestDefinition[]
): OrderMaterialType[] {
  const materials = new Set(tests.map((test) => test.materialType));
  return MATERIAL_ORDER.filter((materialType) => materials.has(materialType));
}

export function validateOrderAdditionalData(
  selections: OrderTestSelectionInput[],
  testsById: Map<string, OrderMedicalTestDefinition>
): OrderAdditionalDataValidationResult {
  const errors: OrderValidationFieldError[] = [];
  const normalizedSelections: NormalizedOrderTestSelection[] = [];

  for (const [index, selection] of selections.entries()) {
    const medicalTestId = selection.medicalTestId;
    if (!medicalTestId) {
      continue;
    }

    const test = testsById.get(medicalTestId);
    if (!test) {
      continue;
    }

    const normalizedData = validateSingleAdditionalData(
      index,
      selection.additionalData,
      test.requiredFields,
      errors
    );

    normalizedSelections.push({
      medicalTestId,
      additionalData: normalizedData
    });
  }

  if (errors.length) {
    return { valid: false, errors };
  }

  return { valid: true, value: normalizedSelections };
}

function validateSingleAdditionalData(
  testIndex: number,
  input: Record<string, unknown> | null | undefined,
  fields: OrderRequiredFieldDefinition[],
  errors: OrderValidationFieldError[]
): OrderAdditionalData | null {
  const definitionsByCode = new Map(fields.map((field) => [field.code, field]));
  const inputData = input ?? {};
  const normalized: OrderAdditionalData = {};

  for (const key of Object.keys(inputData)) {
    const definition = definitionsByCode.get(key);
    if (!definition) {
      errors.push({
        field: `tests.${testIndex}.additionalData.${key}`,
        code: "UNKNOWN_ADDITIONAL_DATA_FIELD"
      });
      continue;
    }

    const value = inputData[key];
    const normalizedValue = normalizeAdditionalDataValue(value, definition);
    if (normalizedValue === undefined) {
      errors.push({
        field: `tests.${testIndex}.additionalData.${key}`,
        code: "INVALID_ADDITIONAL_DATA_TYPE"
      });
      continue;
    }
    normalized[key] = normalizedValue;
  }

  for (const field of fields) {
    if (!field.required) {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(inputData, field.code)) {
      errors.push({
        field: `tests.${testIndex}.additionalData.${field.code}`,
        code: "REQUIRED_ADDITIONAL_DATA"
      });
    }
  }

  return Object.keys(normalized).length ? normalized : null;
}

function normalizeAdditionalDataValue(
  value: unknown,
  definition: OrderRequiredFieldDefinition
): OrderAdditionalDataValue | undefined {
  if (definition.valueType === "BOOLEAN") {
    return typeof value === "boolean" ? value : undefined;
  }

  if (definition.valueType === "TEXT") {
    if (typeof value !== "string") {
      return undefined;
    }
    const normalized = value.trim();
    return normalized.length ? normalized : undefined;
  }

  return undefined;
}
