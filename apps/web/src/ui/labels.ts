import type {
  Gender,
  IdentifierType,
  MaterialType,
  OrderPriority,
  OrderStatus,
  ResultFlag,
  SampleStatus
} from "@klinika/api-contracts";

export const identifierTypeLabels: Record<IdentifierType, string> = {
  PESEL: "PESEL",
  OTHER_DOCUMENT: "Inny dokument"
};

export const genderLabels: Record<Gender, string> = {
  FEMALE: "Kobieta",
  MALE: "Mężczyzna"
};

export const activeLabels: Record<string, string> = {
  true: "Aktywny",
  false: "Nieaktywny"
};

export const orderStatusLabels: Record<OrderStatus, string> = {
  DRAFT: "Przygotowywane",
  SAMPLE_COLLECTION_IN_PROGRESS: "Trwa pobieranie próbek",
  SAMPLE_COLLECTED: "Próbki pobrane",
  SENT_TO_LAB: "Wysłane do laboratorium",
  PROCESSING: "W trakcie realizacji",
  PARTIAL: "Wynik częściowy",
  COMPLETED: "Zakończone",
  REJECTED: "Odrzucone",
  TECHNICAL_ERROR: "Błąd techniczny"
};

export const orderPriorityLabels: Record<OrderPriority, string> = {
  ROUTINE: "Rutynowe",
  URGENT: "Pilne"
};

export const sampleStatusLabels: Record<SampleStatus, string> = {
  REQUIRED: "Wymagana",
  COLLECTED: "Pobrana",
  SENT: "Wysłana",
  ACCEPTED: "Zaakceptowana",
  REJECTED: "Odrzucona"
};

export const materialTypeLabels: Record<MaterialType, string> = {
  EDTA_BLOOD: "Krew (EDTA)",
  SERUM: "Surowica",
  URINE: "Mocz"
};

export const resultFlagLabels: Record<ResultFlag, string> = {
  LOW: "Niski",
  NORMAL: "W normie",
  HIGH: "Wysoki",
  NOT_APPLICABLE: "Nie dotyczy"
};

export function formatIdentifier(input: {
  identifierType: IdentifierType;
  pesel: string | null;
  documentType: string | null;
  documentNumber: string | null;
  documentCountry: string | null;
}) {
  if (input.identifierType === "PESEL") {
    return input.pesel ?? "Nie podano";
  }

  return [input.documentType, input.documentNumber, input.documentCountry]
    .filter(Boolean)
    .join(" / ");
}
