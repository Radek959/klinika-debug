const CORRELATION_ID_EXAMPLE = "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7";

export const PATIENT_NOT_FOUND_EXAMPLE = {
  patientNotFound: {
    summary: "Pacjent nie istnieje albo należy do innego workspace'u",
    value: {
      error: {
        code: "PATIENT_NOT_FOUND",
        message: "Nie znaleziono pacjenta.",
        correlationId: CORRELATION_ID_EXAMPLE
      }
    }
  }
};

export const DUPLICATE_PESEL_EXAMPLE = {
  duplikatPesel: {
    summary: "Pacjent z tym PESEL-em już istnieje",
    value: {
      error: {
        code: "DUPLICATE_PESEL",
        message: "W tej placówce istnieje już pacjent z tym numerem PESEL.",
        correlationId: CORRELATION_ID_EXAMPLE,
        fieldErrors: [
          {
            field: "pesel",
            code: "DUPLICATE_PESEL",
            message: "W tej placówce istnieje już pacjent z tym numerem PESEL."
          }
        ]
      }
    }
  }
};

export const DUPLICATE_DOCUMENT_EXAMPLE = {
  duplikatDokumentu: {
    summary: "Pacjent z tym dokumentem już istnieje",
    value: {
      error: {
        code: "DUPLICATE_DOCUMENT",
        message: "W tej placówce istnieje już pacjent z tym dokumentem.",
        correlationId: CORRELATION_ID_EXAMPLE,
        fieldErrors: [
          {
            field: "documentNumber",
            code: "DUPLICATE_DOCUMENT",
            message: "W tej placówce istnieje już pacjent z tym dokumentem."
          }
        ]
      }
    }
  }
};

export const PATIENT_VALIDATION_ERROR_EXAMPLES = {
  brakKontaktu: {
    summary: "Brak telefonu i e-maila pacjenta",
    value: {
      error: {
        code: "PATIENT_VALIDATION_ERROR",
        message: "Nie udało się zapisać pacjenta.",
        correlationId: CORRELATION_ID_EXAMPLE,
        fieldErrors: [
          {
            field: "contact",
            code: "CONTACT_REQUIRED",
            message: "Podaj telefon albo e-mail pacjenta."
          }
        ]
      }
    }
  },
  brakOpiekuna: {
    summary: "Brak opiekuna dla pacjenta niepełnoletniego",
    value: {
      error: {
        code: "PATIENT_VALIDATION_ERROR",
        message: "Nie udało się zapisać pacjenta.",
        correlationId: CORRELATION_ID_EXAMPLE,
        fieldErrors: [
          {
            field: "guardian",
            code: "GUARDIAN_REQUIRED",
            message: "Dla pacjenta niepełnoletniego wymagany jest opiekun."
          }
        ]
      }
    }
  },
  niezgodnoscPeselZDataUrodzenia: {
    summary: "PESEL niezgodny z datą urodzenia",
    value: {
      error: {
        code: "PATIENT_VALIDATION_ERROR",
        message: "Nie udało się zapisać pacjenta.",
        correlationId: CORRELATION_ID_EXAMPLE,
        fieldErrors: [
          {
            field: "birthDate",
            code: "PESEL_BIRTH_DATE_MISMATCH",
            message: "Data urodzenia musi być zgodna z numerem PESEL."
          }
        ]
      }
    }
  }
};

export const PATIENTS_QUERY_VALIDATION_ERROR_EXAMPLE = {
  niepoprawnyParametr: {
    summary: "Niepoprawny parametr zapytania",
    value: {
      error: {
        code: "VALIDATION_ERROR",
        message: "Żądanie zawiera nieprawidłowe dane.",
        correlationId: CORRELATION_ID_EXAMPLE,
        fieldErrors: [
          {
            field: "pageSize",
            code: "INVALID_PAGE_SIZE",
            message: "Rozmiar strony nie może przekraczać 100."
          }
        ]
      }
    }
  }
};
