export type OrderPriority = "ROUTINE" | "URGENT";

export type OrderStatus =
  | "DRAFT"
  | "SAMPLE_COLLECTION_IN_PROGRESS"
  | "SAMPLE_COLLECTED"
  | "SENT_TO_LAB"
  | "PROCESSING"
  | "PARTIAL"
  | "COMPLETED"
  | "REJECTED"
  | "TECHNICAL_ERROR";

export type SampleStatus =
  | "REQUIRED"
  | "COLLECTED"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED";

export type MaterialType = "EDTA_BLOOD" | "SERUM" | "URINE";

export type TestParameterValueType = "NUMERIC" | "TEXT";

export type MedicalTestRequiredFieldValueType = "BOOLEAN" | "TEXT";

export interface MedicalTestParameterResponse {
  code: string;
  name: string;
  valueType: TestParameterValueType;
  unit: string | null;
  displayOrder: number;
}

export interface MedicalTestRequiredFieldResponse {
  code: string;
  label: string;
  valueType: MedicalTestRequiredFieldValueType;
  required: boolean;
  displayOrder: number;
}

export interface MedicalTestCatalogItem {
  id: string;
  code: string;
  name: string;
  description: string;
  materialType: MaterialType;
  estimatedDurationMinutes: number;
  active: boolean;
  parameters: MedicalTestParameterResponse[];
  requiredFields: MedicalTestRequiredFieldResponse[];
}

export interface MedicalTestsListResponse {
  items: MedicalTestCatalogItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface MedicalTestsListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  active?: "true" | "false";
  materialType?: MaterialType;
  sort?: "code" | "name" | "estimatedDurationMinutes";
  order?: "asc" | "desc";
}
