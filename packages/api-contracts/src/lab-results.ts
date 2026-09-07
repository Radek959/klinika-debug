export type ResultFlag = "LOW" | "NORMAL" | "HIGH" | "NOT_APPLICABLE";

export interface LabResultParameterPayload {
  code: string;
  value: string;
  unit: string | null;
  flag: ResultFlag;
}

export interface LabResultTestPayload {
  medicalTestId: string;
  parameters: LabResultParameterPayload[];
}

export type LabResultsWebhookStatus = "PARTIAL" | "COMPLETED" | "REJECTED";

/**
 * Pojedyncza próbka odrzucona przez laboratorium.
 *
 * Kod i opis przyczyny są syntetyczne i pochodzą z symulatora. Nie zawierają
 * danych pacjenta, kodu kreskowego próbki ani żadnej diagnozy medycznej.
 */
export interface LabRejectedSamplePayload {
  sampleId: string;
  rejectionCode: string;
  rejectionReason: string;
}

/** Maksymalne długości pól przyczyny odrzucenia w kontrakcie callbacka. */
export const LAB_REJECTION_CODE_MAX_LENGTH = 64;
export const LAB_REJECTION_REASON_MAX_LENGTH = 300;

export interface LabResultsWebhookRequest {
  externalOrderId: string;
  eventId: string;
  correlationId?: string | null;
  status: LabResultsWebhookStatus;
  results: LabResultTestPayload[];
  pendingMedicalTestIds: string[];
  /**
   * Lista odrzuconych próbek. Wymagana i niepusta dla statusu `REJECTED`,
   * pusta albo nieobecna dla statusów `PARTIAL` i `COMPLETED`.
   */
  rejectedSamples?: LabRejectedSamplePayload[];
}

export interface OrderResultParameter {
  code: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
  flag: ResultFlag;
  resultedAt: string;
}

export interface OrderResultItem {
  medicalTestId: string;
  parameters: OrderResultParameter[];
}
