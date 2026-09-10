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

export type OrderTestStatus = "PENDING" | "COMPLETED" | "REJECTED";

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
  /**
   * WORKSHOP CONTROLLED DEFECT (ORDER_PRIORITY_MAPPING) — wewnętrzna nazwa,
   * NIE do użycia w publicznym DTO/OpenAPI/nazwie pola: ten opaque boolean
   * jest jedynym sygnałem z backendu, odczytywanym przez formularz nowego
   * zlecenia tuż przed wysłaniem żądania, żeby przełączenie defektu w
   * `/admin` zadziałało na kolejnym submicie bez odświeżenia strony. `true`
   * tylko przy tym jednym kontrolowanym defekcie; w `CLEAN` i przy każdym
   * innym defekcie zawsze `false`. Nazwa pola i opis widoczne w publicznym
   * kontrakcie/OpenAPI (patrz `MedicalTestsListResponseDto`) muszą pozostać
   * neutralne — bez słów "priorytet", "workshop", "prowadzący" ani
   * "controlled bug".
   */
  catalogFlag: boolean;
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
