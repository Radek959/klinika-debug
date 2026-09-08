import type { Gender, IdentifierType, PeselValidationCode } from "./patient.types";
import { readPeselData, validatePesel } from "./pesel";

export type PatientWriteValidationCode =
  | "REQUIRED"
  | "INVALID_NAME"
  | "INVALID_DATE"
  | "INVALID_PHONE"
  | "INVALID_EMAIL"
  | "INVALID_IDENTIFIER_FIELDS"
  | "CONTACT_REQUIRED"
  | "GUARDIAN_REQUIRED"
  | "GUARDIAN_CONTACT_REQUIRED"
  | "PESEL_BIRTH_DATE_MISMATCH"
  | "PESEL_GENDER_MISMATCH"
  | "INVALID_ACTIVE_VALUE"
  | "MAX_LENGTH_EXCEEDED"
  | PeselValidationCode;

export interface PatientWriteFieldError {
  field: string;
  code: PatientWriteValidationCode;
}

export interface GuardianWriteState {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface PatientWriteState {
  firstName?: string | null;
  lastName?: string | null;
  identifierType?: IdentifierType | null;
  pesel?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  documentCountry?: string | null;
  birthDate?: string | null;
  gender?: Gender | null;
  citizenship?: string | null;
  phone?: string | null;
  email?: string | null;
  addressStreet?: string | null;
  addressBuildingNumber?: string | null;
  addressApartmentNumber?: string | null;
  addressPostalCode?: string | null;
  addressCity?: string | null;
  addressCountry?: string | null;
  active?: boolean | null;
  guardian?: GuardianWriteState | null;
}

export interface NormalizedGuardianWriteState {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
}

export interface NormalizedPatientWriteState {
  firstName: string;
  lastName: string;
  identifierType: IdentifierType;
  pesel: string | null;
  documentType: string | null;
  documentNumber: string | null;
  documentCountry: string | null;
  birthDate: string;
  gender: Gender;
  citizenship: string | null;
  phone: string | null;
  email: string | null;
  addressStreet: string | null;
  addressBuildingNumber: string | null;
  addressApartmentNumber: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  addressCountry: string | null;
  active: boolean;
  guardian: NormalizedGuardianWriteState | null;
}

export type PatientWriteValidationResult =
  | { valid: true; value: NormalizedPatientWriteState }
  | { valid: false; errors: PatientWriteFieldError[] };

const NAME_PATTERN = /^[\p{L}][\p{L} '-]*$/u;
const PHONE_PATTERN = /^(?:\d{9}|\+48\d{9})$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATABASE_TEXT_MAX_LENGTH = 191;

export interface PatientWriteValidationOptions {
  /**
   * WORKSHOP CONTROLLED DEFECT (PATIENT_GUARDIAN): when `true`, disables
   * ONLY the `GUARDIAN_REQUIRED` rule below — a minor patient without a
   * guardian is accepted instead of rejected. Every other rule (PESEL,
   * birth date, sex, patient contact, guardian-data validation when a
   * guardian IS provided, etc.) is completely unaffected.
   *
   * Default (`false`/omitted) is the CLEAN, product-doc-correct behavior:
   * `GUARDIAN_REQUIRED` always applies to a minor without a guardian. This
   * option exists only so `apps/api/src/patients/patients.service.ts` can
   * pass the current, globally-configured controlled bug through — it is
   * never toggled from within this file.
   */
  disableGuardianRequiredRule?: boolean;
}

export function validatePatientFinalState(
  input: PatientWriteState,
  referenceDate: Date,
  options?: PatientWriteValidationOptions
): PatientWriteValidationResult {
  const errors: PatientWriteFieldError[] = [];
  const identifierType = input.identifierType;

  const firstName = normalizeName(input.firstName, "firstName", errors);
  const lastName = normalizeName(input.lastName, "lastName", errors);
  const birthDate = normalizeDate(input.birthDate, "birthDate", errors);
  const gender = normalizeGender(input.gender, "gender", errors);

  if (identifierType !== "PESEL" && identifierType !== "OTHER_DOCUMENT") {
    errors.push({ field: "identifierType", code: "REQUIRED" });
  }

  const pesel = normalizeOptionalText(input.pesel);
  let documentType = normalizeOptionalTextMax(
    input.documentType,
    "documentType",
    errors
  );
  let documentNumber = normalizeOptionalTextMax(
    input.documentNumber,
    "documentNumber",
    errors
  );
  let documentCountry = normalizeOptionalTextMax(
    input.documentCountry,
    "documentCountry",
    errors
  );

  if (identifierType === "PESEL") {
    validatePeselIdentifier(pesel, birthDate, gender, errors);
    if (documentType || documentNumber || documentCountry) {
      errors.push({ field: "identifierType", code: "INVALID_IDENTIFIER_FIELDS" });
    }
    documentType = null;
    documentNumber = null;
    documentCountry = null;
  }

  if (identifierType === "OTHER_DOCUMENT") {
    if (pesel) {
      errors.push({ field: "pesel", code: "INVALID_IDENTIFIER_FIELDS" });
    }
    if (!documentType) {
      errors.push({ field: "documentType", code: "REQUIRED" });
    }
    if (!documentNumber) {
      errors.push({ field: "documentNumber", code: "REQUIRED" });
    }
    if (!documentCountry) {
      errors.push({ field: "documentCountry", code: "REQUIRED" });
    }
  }

  const phone = normalizeOptionalText(input.phone);
  const email = normalizeOptionalTextMax(input.email, "email", errors);
  validateContact(phone, email, "", "CONTACT_REQUIRED", errors);
  const citizenship = normalizeOptionalTextMax(
    input.citizenship,
    "citizenship",
    errors
  );
  const addressStreet = normalizeOptionalTextMax(
    input.addressStreet,
    "addressStreet",
    errors
  );
  const addressBuildingNumber = normalizeOptionalTextMax(
    input.addressBuildingNumber,
    "addressBuildingNumber",
    errors
  );
  const addressApartmentNumber = normalizeOptionalTextMax(
    input.addressApartmentNumber,
    "addressApartmentNumber",
    errors
  );
  const addressPostalCode = normalizeOptionalTextMax(
    input.addressPostalCode,
    "addressPostalCode",
    errors
  );
  const addressCity = normalizeOptionalTextMax(
    input.addressCity,
    "addressCity",
    errors
  );
  const addressCountry = normalizeOptionalTextMax(
    input.addressCountry,
    "addressCountry",
    errors
  );

  let active = input.active;
  if (active === undefined) {
    active = true;
  }
  if (active !== false && active !== true) {
    errors.push({ field: "active", code: "INVALID_ACTIVE_VALUE" });
  }
  const normalizedActive = active === false ? false : true;

  const guardianWasProvided =
    input.guardian !== undefined && input.guardian !== null;
  const guardian = validateGuardian(input.guardian, errors);
  // WORKSHOP CONTROLLED DEFECT (PATIENT_GUARDIAN): see
  // PatientWriteValidationOptions.disableGuardianRequiredRule above. CLEAN
  // (the `!options?.disableGuardianRequiredRule` branch) always rejects a
  // minor patient without a guardian.
  if (
    birthDate &&
    isMinorOnDate(birthDate, referenceDate) &&
    !guardian &&
    !guardianWasProvided &&
    !options?.disableGuardianRequiredRule
  ) {
    errors.push({ field: "guardian", code: "GUARDIAN_REQUIRED" });
  }

  if (errors.length) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      firstName: firstName as string,
      lastName: lastName as string,
      identifierType: identifierType as IdentifierType,
      pesel: identifierType === "PESEL" ? pesel : null,
      documentType,
      documentNumber,
      documentCountry,
      birthDate: birthDate as string,
      gender: gender as Gender,
      citizenship,
      phone,
      email,
      addressStreet,
      addressBuildingNumber,
      addressApartmentNumber,
      addressPostalCode,
      addressCity,
      addressCountry,
      active: normalizedActive,
      guardian
    }
  };
}

export function isMinorOnDate(birthDate: string, referenceDate: Date): boolean {
  const [year, month, day] = birthDate.split("-").map(Number);
  const eighteenthBirthday = Date.UTC(year + 18, month - 1, day);
  const referenceDay = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate()
  );
  return referenceDay < eighteenthBirthday;
}

function validatePeselIdentifier(
  pesel: string | null,
  birthDate: string | null,
  gender: Gender | null,
  errors: PatientWriteFieldError[]
) {
  if (!pesel) {
    errors.push({ field: "pesel", code: "REQUIRED" });
    return;
  }

  const result = validatePesel(pesel);
  if (!result.valid) {
    errors.push(...result.errors);
    return;
  }

  const data = readPeselData(pesel);
  if (!data) {
    errors.push({ field: "pesel", code: "INVALID_BIRTH_DATE" });
    return;
  }

  if (birthDate && data.birthDate !== birthDate) {
    errors.push({ field: "birthDate", code: "PESEL_BIRTH_DATE_MISMATCH" });
  }
  if (gender && data.gender !== gender) {
    errors.push({ field: "gender", code: "PESEL_GENDER_MISMATCH" });
  }
}

function validateGuardian(
  input: GuardianWriteState | null | undefined,
  errors: PatientWriteFieldError[]
): NormalizedGuardianWriteState | null {
  if (!input) {
    return null;
  }

  const firstName = normalizeName(input.firstName, "guardian.firstName", errors);
  const lastName = normalizeName(input.lastName, "guardian.lastName", errors);
  const phone = normalizeOptionalText(input.phone);
  const email = normalizeOptionalTextMax(input.email, "guardian.email", errors);
  validateContact(
    phone,
    email,
    "guardian.",
    "GUARDIAN_CONTACT_REQUIRED",
    errors
  );

  if (!firstName || !lastName || errors.some((error) => error.field.startsWith("guardian."))) {
    return null;
  }

  return {
    firstName,
    lastName,
    phone,
    email
  };
}

function validateContact(
  phone: string | null,
  email: string | null,
  prefix: string,
  requiredCode: "CONTACT_REQUIRED" | "GUARDIAN_CONTACT_REQUIRED",
  errors: PatientWriteFieldError[]
) {
  if (!phone && !email) {
    errors.push({ field: `${prefix}contact`, code: requiredCode });
    return;
  }

  if (phone && !PHONE_PATTERN.test(phone)) {
    errors.push({ field: `${prefix}phone`, code: "INVALID_PHONE" });
  }

  if (email && !EMAIL_PATTERN.test(email)) {
    errors.push({ field: `${prefix}email`, code: "INVALID_EMAIL" });
  }
}

function normalizeName(
  value: string | null | undefined,
  field: string,
  errors: PatientWriteFieldError[]
): string | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    errors.push({ field, code: "REQUIRED" });
    return null;
  }

  if (
    normalized.length < 2 ||
    normalized.length > 60 ||
    !NAME_PATTERN.test(normalized) ||
    !/\p{L}/u.test(normalized)
  ) {
    errors.push({ field, code: "INVALID_NAME" });
    return null;
  }

  return normalized;
}

function normalizeDate(
  value: string | null | undefined,
  field: string,
  errors: PatientWriteFieldError[]
): string | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    errors.push({ field, code: "REQUIRED" });
    return null;
  }

  if (!DATE_ONLY_PATTERN.test(normalized)) {
    errors.push({ field, code: "INVALID_DATE" });
    return null;
  }

  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    errors.push({ field, code: "INVALID_DATE" });
    return null;
  }

  return normalized;
}

function normalizeGender(
  value: Gender | null | undefined,
  field: string,
  errors: PatientWriteFieldError[]
): Gender | null {
  if (value !== "FEMALE" && value !== "MALE") {
    errors.push({ field, code: "REQUIRED" });
    return null;
  }
  return value;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function normalizeOptionalTextMax(
  value: string | null | undefined,
  field: string,
  errors: PatientWriteFieldError[]
): string | null {
  const normalized = normalizeOptionalText(value);
  if (normalized && normalized.length > DATABASE_TEXT_MAX_LENGTH) {
    errors.push({ field, code: "MAX_LENGTH_EXCEEDED" });
    return null;
  }
  return normalized;
}
