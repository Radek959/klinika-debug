import type {
  MedicalTest,
  Order,
  OrderTest,
  Patient,
  Sample
} from "@prisma/client";
import { sortMaterialTypes } from "@klinika/domain";
import type {
  OrderAdditionalData,
  OrderResponse,
  OrderSampleResponse,
  OrderTestResponse,
  OrdersListResponse,
  OrderListItem,
  OrderPatientSummary,
  OrderDetailsResponse,
  OrderPatientDetails
} from "@klinika/api-contracts";

type OrderTestWithCatalog = OrderTest & {
  medicalTest: Pick<MedicalTest, "code" | "name" | "materialType">;
};

type OrderWithRelations = Order & {
  patient: Patient;
  tests: OrderTestWithCatalog[];
  samples: Sample[];
};

function toDateString(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function toDateOnlyString(date: Date): string {
  return date.toISOString().split("T")[0];
}

function toPatientSummary(patient: Patient): OrderPatientSummary {
  return {
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    identifierType: patient.identifierType,
    pesel: patient.pesel,
    documentType: patient.documentType,
    documentNumber: patient.documentNumber,
    documentCountry: patient.documentCountry,
    birthDate: toDateOnlyString(patient.birthDate),
    active: patient.active
  };
}

function toPatientDetails(patient: Patient): OrderPatientDetails {
  return {
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    identifierType: patient.identifierType,
    pesel: patient.pesel,
    documentType: patient.documentType,
    documentNumber: patient.documentNumber,
    documentCountry: patient.documentCountry,
    birthDate: toDateOnlyString(patient.birthDate),
    gender: patient.gender,
    active: patient.active
  };
}

export function toOrderResponse(
  order: Order,
  tests: OrderTestWithCatalog[],
  samples: Sample[]
): OrderResponse {
  return {
    id: order.id,
    patientId: order.patientId,
    priority: order.priority,
    status: order.status,
    tests: tests.map(toOrderTestResponse),
    samples: samples.map(toOrderSampleResponse),
    createdByUserId: order.createdByUserId,
    externalOrderId: order.externalOrderId,
    correlationId: order.correlationId,
    sentAt: toDateString(order.sentAt),
    estimatedCompletionAt: toDateString(order.estimatedCompletionAt),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString()
  };
}

export function toOrderListResponse(
  orders: OrderWithRelations[],
  page: number,
  pageSize: number,
  total: number
): OrdersListResponse {
  const items = orders.map((order) => toOrderListItem(order));
  const totalPages = Math.ceil(total / pageSize);

  return {
    items,
    page,
    pageSize,
    total,
    totalPages
  };
}

function toOrderListItem(order: OrderWithRelations): OrderListItem {
  // Sort tests by code
  const sortedTests = [...order.tests].sort((a, b) =>
    a.medicalTest.code.localeCompare(b.medicalTest.code)
  );

  // Sort samples by material type
  const sortedSamples = [...order.samples].sort((a, b) =>
    sortMaterialTypes(a.materialType, b.materialType)
  );

  return {
    id: order.id,
    patient: toPatientSummary(order.patient),
    priority: order.priority,
    status: order.status,
    tests: sortedTests.map((test) => ({
      medicalTestId: test.medicalTestId,
      code: test.medicalTest.code,
      name: test.medicalTest.name,
      materialType: test.medicalTest.materialType
    })),
    samples: sortedSamples.map((sample) => ({
      materialType: sample.materialType,
      status: sample.status
    })),
    externalOrderId: order.externalOrderId,
    correlationId: order.correlationId,
    sentAt: toDateString(order.sentAt),
    estimatedCompletionAt: toDateString(order.estimatedCompletionAt),
    createdByUserId: order.createdByUserId,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString()
  };
}

export function toOrderDetailsResponse(
  order: OrderWithRelations
): OrderDetailsResponse {
  return {
    ...(toOrderResponse(order, order.tests, order.samples) as any),
    patient: toPatientDetails(order.patient)
  };
}

function toOrderTestResponse(test: OrderTestWithCatalog): OrderTestResponse {
  return {
    id: test.id,
    medicalTestId: test.medicalTestId,
    code: test.medicalTest.code,
    name: test.medicalTest.name,
    materialType: test.medicalTest.materialType,
    additionalData: test.additionalData as OrderAdditionalData | null
  };
}

function toOrderSampleResponse(sample: Sample): OrderSampleResponse {
  return {
    id: sample.id,
    materialType: sample.materialType,
    status: sample.status,
    barcode: sample.barcode,
    collectedAt: toDateString(sample.collectedAt),
    collectedByUserId: sample.collectedByUserId,
    rejectionCode: sample.rejectionCode,
    rejectionReason: sample.rejectionReason
  };
}
