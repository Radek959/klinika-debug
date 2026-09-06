import type {
  MedicalTest,
  MedicalTestRequiredField,
  TestParameter
} from "@prisma/client";
import type {
  MedicalTestCatalogItem,
  MedicalTestParameterResponse,
  MedicalTestRequiredFieldResponse
} from "@klinika/api-contracts";

type MedicalTestWithDetails = MedicalTest & {
  parameters: TestParameter[];
  requiredFields: MedicalTestRequiredField[];
};

export function toMedicalTestCatalogItem(
  test: MedicalTestWithDetails
): MedicalTestCatalogItem {
  return {
    id: test.id,
    code: test.code,
    name: test.name,
    description: test.description,
    materialType: test.materialType,
    estimatedDurationMinutes: test.estimatedDurationMinutes,
    active: test.active,
    parameters: test.parameters.map(toMedicalTestParameter),
    requiredFields: test.requiredFields.map(toMedicalTestRequiredField)
  };
}

function toMedicalTestParameter(
  parameter: TestParameter
): MedicalTestParameterResponse {
  return {
    code: parameter.code,
    name: parameter.name,
    valueType: parameter.valueType,
    unit: parameter.unit,
    displayOrder: parameter.displayOrder
  };
}

function toMedicalTestRequiredField(
  field: MedicalTestRequiredField
): MedicalTestRequiredFieldResponse {
  return {
    code: field.code,
    label: field.label,
    valueType: field.valueType,
    required: field.required,
    displayOrder: field.displayOrder
  };
}
