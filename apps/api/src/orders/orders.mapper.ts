import type {
  MedicalTest,
  Order,
  OrderTest,
  Patient,
  Result,
  Sample
} from "@prisma/client";
import { sortMaterialTypes } from "@klinika/domain";
import type {
  OrderAdditionalData,
  OrderResponse,
  OrderResultItem,
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

type OrderDetailsWithRelations = OrderWithRelations & {
  results: Result[];
  labSendRetryJobs: Array<{ status: "PENDING" | "PROCESSING" | "DONE" | "FAILED" }>;
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
    active: patient.active,
    createdAt: patient.createdAt.toISOString(),
    updatedAt: patient.updatedAt.toISOString()
  };
}

export function toOrderResponse(
  order: Order,
  tests: OrderTestWithCatalog[],
  samples: Sample[]
): OrderResponse {
  const sortedTests = [...tests].sort((a, b) =>
    a.medicalTest.code.localeCompare(b.medicalTest.code)
  );
  const sortedSamples = [...samples].sort((a, b) =>
    sortMaterialTypes(a.materialType, b.materialType)
  );

  return {
    id: order.id,
    patientId: order.patientId,
    priority: order.priority,
    status: order.status,
    tests: sortedTests.map(toOrderTestResponse),
    samples: sortedSamples.map(toOrderSampleResponse),
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
  order: OrderDetailsWithRelations
): OrderDetailsResponse {
  return {
    ...(toOrderResponse(order, order.tests, order.samples) as any),
    patient: toPatientDetails(order.patient),
    results: toOrderResultItems(order.tests, order.results),
    labSendRetryPending: order.labSendRetryJobs.some(
      (job) => job.status === "PENDING" || job.status === "PROCESSING"
    )
  };
}

function toOrderResultItems(
  tests: OrderTestWithCatalog[],
  results: Result[]
): OrderResultItem[] {
  const resultsByTest = new Map<string, Result[]>();
  for (const result of results) {
    const existing = resultsByTest.get(result.medicalTestId) ?? [];
    existing.push(result);
    resultsByTest.set(result.medicalTestId, existing);
  }

  return tests
    .filter((test) => resultsByTest.has(test.medicalTestId))
    .map((test) => {
      const testResults = [...(resultsByTest.get(test.medicalTestId) ?? [])].sort(
        (a, b) => a.parameterCode.localeCompare(b.parameterCode)
      );
      return {
        medicalTestId: test.medicalTestId,
        parameters: testResults.map((result) => ({
          code: result.parameterCode,
          value: result.value,
          unit: result.unit,
          referenceRange: result.referenceRange,
          flag: result.flag,
          resultedAt: result.resultedAt.toISOString()
        }))
      };
    });
}

function toOrderTestResponse(test: OrderTestWithCatalog): OrderTestResponse {
  return {
    id: test.id,
    medicalTestId: test.medicalTestId,
    code: test.medicalTest.code,
    name: test.medicalTest.name,
    materialType: test.medicalTest.materialType,
    status: test.status,
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
