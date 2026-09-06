export type SampleStatusValue =
  | "REQUIRED"
  | "COLLECTED"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED";

export type SampleCollectionDateCode =
  | "COLLECTED_AT_IN_FUTURE"
  | "COLLECTED_AT_BEFORE_ORDER";

export interface SampleCollectionFieldError {
  field: "collectedAt";
  code: SampleCollectionDateCode;
}

export function validateCollectedAt(
  collectedAt: Date,
  orderCreatedAt: Date,
  now: Date = new Date()
): SampleCollectionFieldError[] {
  if (collectedAt.getTime() > now.getTime()) {
    return [{ field: "collectedAt", code: "COLLECTED_AT_IN_FUTURE" }];
  }

  if (collectedAt.getTime() < orderCreatedAt.getTime()) {
    return [{ field: "collectedAt", code: "COLLECTED_AT_BEFORE_ORDER" }];
  }

  return [];
}

export function determineOrderStatusAfterSampleCollection(
  sampleStatuses: SampleStatusValue[]
): "SAMPLE_COLLECTION_IN_PROGRESS" | "SAMPLE_COLLECTED" {
  const allCollected = sampleStatuses.every((status) => status !== "REQUIRED");
  return allCollected ? "SAMPLE_COLLECTED" : "SAMPLE_COLLECTION_IN_PROGRESS";
}
