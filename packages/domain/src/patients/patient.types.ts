export type IdentifierType = "PESEL" | "OTHER_DOCUMENT";
export type Gender = "FEMALE" | "MALE";

export type PeselValidationCode =
  | "INVALID_LENGTH"
  | "INVALID_DIGITS"
  | "INVALID_BIRTH_DATE"
  | "INVALID_CHECKSUM";

export interface PeselValidationError {
  field: "pesel";
  code: PeselValidationCode;
}

export interface PeselData {
  birthDate: string;
  gender: Gender;
}

export type PeselValidationResult =
  | {
      valid: true;
      data: PeselData;
    }
  | {
      valid: false;
      errors: PeselValidationError[];
    };
