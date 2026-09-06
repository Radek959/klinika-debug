import type { Gender, IdentifierType } from "@klinika/api-contracts";

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
