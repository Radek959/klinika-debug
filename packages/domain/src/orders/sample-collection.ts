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

/**
 * Ucina znacznik czasu do pełnej minuty (zeruje sekundy i milisekundy).
 *
 * `<input type="datetime-local">` w formularzu rejestracji próbki ma
 * dokładność do minuty — jeśli zlecenie powstało np. o 10:15:42, jedyna
 * wartość, jaką uczestnik może wpisać dla "tej samej chwili", to 10:15.
 * Bez normalizacji taka poprawna wartość (10:15:00) wypadałaby PRZED
 * `orderCreatedAt` (10:15:42) i błędnie kończyłaby się
 * `COLLECTED_AT_BEFORE_ORDER`. Używane WYŁĄCZNIE do tej jednej reguły —
 * `COLLECTED_AT_IN_FUTURE` porównuje dokładne znaczniki czasu bez zmian.
 */
function truncateToMinute(date: Date): number {
  return Math.floor(date.getTime() / 60000) * 60000;
}

export function validateCollectedAt(
  collectedAt: Date,
  orderCreatedAt: Date,
  now: Date = new Date()
): SampleCollectionFieldError[] {
  if (collectedAt.getTime() > now.getTime()) {
    return [{ field: "collectedAt", code: "COLLECTED_AT_IN_FUTURE" }];
  }

  if (truncateToMinute(collectedAt) < truncateToMinute(orderCreatedAt)) {
    return [{ field: "collectedAt", code: "COLLECTED_AT_BEFORE_ORDER" }];
  }

  return [];
}

export interface OrderStatusAfterSampleCollectionOptions {
  /**
   * WORKSHOP CONTROLLED DEFECT (ORDER_FLOW): when `true`, an order requiring
   * 2+ distinct samples incorrectly jumps to `SAMPLE_COLLECTED` as soon as
   * the FIRST required sample is collected, even though another sample is
   * still `REQUIRED`.
   *
   * Default (`false`/omitted) is the CLEAN, product-doc-correct behavior:
   * `SAMPLE_COLLECTED` is returned only once every sample is no longer
   * `REQUIRED`; until then the order stays
   * `SAMPLE_COLLECTION_IN_PROGRESS`. This defect is scoped to this one
   * status-transition decision only — it does not touch send-to-lab
   * completeness validation, which is driven entirely by the order status
   * this function returns (see `apps/api/src/orders/orders.service.ts`,
   * `canSendOrder`): an order that is still genuinely
   * `SAMPLE_COLLECTION_IN_PROGRESS` (e.g. zero samples collected yet) still
   * cannot be sent, defect active or not.
   */
  forceCollectedAfterFirstSample?: boolean;
}

export function determineOrderStatusAfterSampleCollection(
  sampleStatuses: SampleStatusValue[],
  options?: OrderStatusAfterSampleCollectionOptions
): "SAMPLE_COLLECTION_IN_PROGRESS" | "SAMPLE_COLLECTED" {
  const allCollected = sampleStatuses.every((status) => status !== "REQUIRED");
  if (allCollected) {
    return "SAMPLE_COLLECTED";
  }

  if (options?.forceCollectedAfterFirstSample) {
    const anyCollected = sampleStatuses.some((status) => status !== "REQUIRED");
    if (anyCollected) {
      return "SAMPLE_COLLECTED";
    }
  }

  return "SAMPLE_COLLECTION_IN_PROGRESS";
}
