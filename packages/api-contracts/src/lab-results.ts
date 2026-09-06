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

export type LabResultsWebhookStatus = "PARTIAL" | "COMPLETED";

export interface LabResultsWebhookRequest {
  externalOrderId: string;
  eventId: string;
  correlationId?: string | null;
  status: LabResultsWebhookStatus;
  results: LabResultTestPayload[];
  pendingMedicalTestIds: string[];
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
