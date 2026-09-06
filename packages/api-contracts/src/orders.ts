import type {
  MaterialType,
  OrderPriority,
  OrderStatus,
  SampleStatus
} from "./tests-catalog";

export type OrderAdditionalDataValue = boolean | string;
export type OrderAdditionalData = Record<string, OrderAdditionalDataValue>;

export interface CreateOrderTestRequest {
  medicalTestId: string;
  additionalData?: OrderAdditionalData;
}

export interface CreateOrderRequest {
  patientId: string;
  priority: OrderPriority;
  tests: CreateOrderTestRequest[];
}

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
