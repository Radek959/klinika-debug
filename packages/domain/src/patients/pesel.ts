import type {
  Gender,
  PeselData,
  PeselValidationError,
  PeselValidationResult
} from "./patient.types";

const PESEL_LENGTH = 11;
const PESEL_WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3] as const;

export function validatePesel(pesel: string): PeselValidationResult {
  const structuralErrors = validatePeselStructure(pesel);
  if (structuralErrors.length) {
    return {
      valid: false,
      errors: structuralErrors
    };
  }

  const data = readPeselData(pesel);
  const errors: PeselValidationError[] = [];

  if (!data) {
    errors.push({ field: "pesel", code: "INVALID_BIRTH_DATE" });
  }

  if (!hasValidPeselChecksum(pesel)) {
    errors.push({ field: "pesel", code: "INVALID_CHECKSUM" });
  }

  if (errors.length || !data) {
    return {
      valid: false,
      errors
    };
  }

  return {
    valid: true,
    data
  };
}

export function readPeselData(pesel: string): PeselData | null {
  if (pesel.length !== PESEL_LENGTH || !/^\d+$/.test(pesel)) {
    return null;
  }

  const birthDate = readPeselBirthDate(pesel);
  if (!birthDate) {
    return null;
  }

  const gender = readPeselGender(pesel);
  if (!gender) {
    return null;
  }

  return {
    birthDate,
    gender
  };
}

export function readPeselBirthDate(pesel: string): string | null {
  const yearPart = Number(pesel.slice(0, 2));
  const encodedMonth = Number(pesel.slice(2, 4));
  const day = Number(pesel.slice(4, 6));
  const century = readPeselCentury(encodedMonth);

  if (!century) {
    return null;
  }

  const month = encodedMonth - century.monthOffset;
  const year = century.yearBase + yearPart;
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

export function readPeselGender(pesel: string): Gender | null {
  if (pesel.length !== PESEL_LENGTH || !/^\d+$/.test(pesel)) {
    return null;
  }

  return Number(pesel[9]) % 2 === 1 ? "MALE" : "FEMALE";
}

function validatePeselStructure(pesel: string): PeselValidationError[] {
  if (pesel.length !== PESEL_LENGTH) {
    return [{ field: "pesel", code: "INVALID_LENGTH" }];
  }

  if (!/^\d+$/.test(pesel)) {
    return [{ field: "pesel", code: "INVALID_DIGITS" }];
  }

  return [];
}

function hasValidPeselChecksum(pesel: string): boolean {
  const sum = PESEL_WEIGHTS.reduce(
    (total, weight, index) => total + Number(pesel[index]) * weight,
    0
  );
  const checksum = (10 - (sum % 10)) % 10;
  return checksum === Number(pesel[10]);
}

function readPeselCentury(
  encodedMonth: number
): { yearBase: number; monthOffset: number } | null {
  if (encodedMonth >= 1 && encodedMonth <= 12) {
    return { yearBase: 1900, monthOffset: 0 };
  }
  if (encodedMonth >= 21 && encodedMonth <= 32) {
    return { yearBase: 2000, monthOffset: 20 };
  }
  if (encodedMonth >= 41 && encodedMonth <= 52) {
    return { yearBase: 2100, monthOffset: 40 };
  }
  if (encodedMonth >= 61 && encodedMonth <= 72) {
    return { yearBase: 2200, monthOffset: 60 };
  }
  if (encodedMonth >= 81 && encodedMonth <= 92) {
    return { yearBase: 1800, monthOffset: 80 };
  }
  return null;
}
