import type {
  Gender,
  IdentifierType
} from "./patients";
import type {
  MaterialType,
  OrderPriority,
  OrderStatus,
  SampleStatus
} from "./tests-catalog";
import type { OrderResultItem } from "./lab-results";

export type OrderAdditionalDataValue = boolean | string;
export type OrderAdditionalData = Record<string, OrderAdditionalDataValue>;

// ============ CREATE REQUEST ============

export interface CreateOrderTestRequest {
  medicalTestId: string;
  additionalData?: OrderAdditionalData;
}

export interface CreateOrderRequest {
  patientId: string;
  priority: OrderPriority;
  tests: CreateOrderTestRequest[];
}

// ============ UPDATE REQUEST ============

export interface UpdateOrderTestRequest {
  medicalTestId: string;
  additionalData?: OrderAdditionalData;
}

export interface UpdateOrderRequest {
  patientId?: string;
  priority?: OrderPriority;
  tests?: UpdateOrderTestRequest[];
}

// ============ SAMPLE REGISTRATION REQUEST ============

export interface RegisterSampleRequest {
  materialType: MaterialType;
  barcode: string;
  collectedAt: string;
}

// ============ RESPONSE TYPES ============

export interface OrderTestResponse {
  id: string;
  medicalTestId: string;
  code: string;
  name: string;
  materialType: MaterialType;
  additionalData: OrderAdditionalData | null;
}

export interface OrderSampleResponse {
  id: string;
  materialType: MaterialType;
  status: SampleStatus;
  barcode: string | null;
  collectedAt: string | null;
  collectedByUserId: string | null;
  rejectionCode: string | null;
  rejectionReason: string | null;
}

export interface OrderResponse {
  id: string;
  patientId: string;
  priority: OrderPriority;
  status: OrderStatus;
  tests: OrderTestResponse[];
  samples: OrderSampleResponse[];
  createdByUserId: string;
  externalOrderId: string | null;
  correlationId: string | null;
  sentAt: string | null;
  estimatedCompletionAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============ LIST RESPONSE TYPES ============

export interface OrderListTestItem {
  medicalTestId: string;
  code: string;
  name: string;
  materialType: MaterialType;
}

export interface OrderListSampleItem {
  materialType: MaterialType;
  status: SampleStatus;
}

export interface OrderPatientSummary {
  id: string;
  firstName: string;
  lastName: string;
  identifierType: IdentifierType;
  pesel: string | null;
  documentType: string | null;
  documentNumber: string | null;
  documentCountry: string | null;
  birthDate: string;
  active: boolean;
}

export interface OrderListItem {
  id: string;
  patient: OrderPatientSummary;
  priority: OrderPriority;
  status: OrderStatus;
  tests: OrderListTestItem[];
  samples: OrderListSampleItem[];
  externalOrderId: string | null;
  correlationId: string | null;
  sentAt: string | null;
  estimatedCompletionAt: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrdersListResponse {
  items: OrderListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type OrdersListSortBy =
  | "createdAt"
  | "updatedAt"
  | "status"
  | "priority"
  | "patientLastName";

export type OrdersListOrderBy = "asc" | "desc";

export interface OrdersListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: OrderStatus;
  priority?: OrderPriority;
  patientId?: string;
  materialType?: MaterialType;
  createdFrom?: string;
  createdTo?: string;
  sort?: OrdersListSortBy;
  order?: OrdersListOrderBy;
}

// ============ DETAILS RESPONSE TYPE ============

export interface OrderPatientDetails {
  id: string;
  firstName: string;
  lastName: string;
  identifierType: IdentifierType;
  pesel: string | null;
  documentType: string | null;
  documentNumber: string | null;
  documentCountry: string | null;
  birthDate: string;
  gender: Gender;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetailsResponse extends OrderResponse {
  patient: OrderPatientDetails;
  results: OrderResultItem[];
}
