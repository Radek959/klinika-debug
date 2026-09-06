import type {
  MedicalTest,
  Order,
  OrderTest,
  Sample
} from "@prisma/client";
import type {
  OrderAdditionalData,
  OrderResponse,
  OrderSampleResponse,
  OrderTestResponse
} from "@klinika/api-contracts";

type OrderTestWithCatalog = OrderTest & {
  medicalTest: Pick<MedicalTest, "code" | "name" | "materialType">;
};

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
    sentAt: toIsoOrNull(order.sentAt),
    estimatedCompletionAt: toIsoOrNull(order.estimatedCompletionAt),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString()
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
    collectedAt: toIsoOrNull(sample.collectedAt),
    collectedByUserId: sample.collectedByUserId,
    rejectionCode: sample.rejectionCode,
    rejectionReason: sample.rejectionReason
  };
}

function toIsoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
