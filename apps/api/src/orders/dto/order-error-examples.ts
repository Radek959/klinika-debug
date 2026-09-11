const CORRELATION_ID_EXAMPLE = "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7";

export const ORDER_NOT_FOUND_EXAMPLE = {
  zlecenieNieIstnieje: {
    summary: "Zlecenie nie istnieje albo należy do innego workspace'u",
    value: {
      error: {
        code: "ORDER_NOT_FOUND",
        message: "Nie znaleziono zlecenia.",
        correlationId: CORRELATION_ID_EXAMPLE
      }
    }
  }
};

export const ORDER_CREATE_VALIDATION_ERROR_EXAMPLE = {
  pustaListaBadan: {
    summary: "Pusta lista badań",
    value: {
      error: {
        code: "ORDER_VALIDATION_ERROR",
        message: "Nie udało się utworzyć zlecenia.",
        correlationId: CORRELATION_ID_EXAMPLE,
        fieldErrors: [
          {
            field: "tests",
            code: "TESTS_REQUIRED",
            message: "Zlecenie musi zawierać co najmniej jedno badanie."
          }
        ]
      }
    }
  }
};

export const ORDER_UPDATE_EMPTY_PATCH_EXAMPLE = {
  pustyPatch: {
    summary: "PATCH bez żadnego pola do aktualizacji",
    value: {
      error: {
        code: "VALIDATION_ERROR",
        message: "PATCH musi zawierać co najmniej jedno pole do aktualizacji.",
        correlationId: CORRELATION_ID_EXAMPLE,
        fieldErrors: [
          {
            field: "body",
            code: "EMPTY_PATCH",
            message: "PATCH musi zawierać co najmniej jedno pole do aktualizacji."
          }
        ]
      }
    }
  }
};

export const ORDER_UPDATE_VALIDATION_ERROR_EXAMPLE = {
  zleceniePozaDraft: {
    summary: "Zlecenie nie jest w edytowalnym statusie",
    value: {
      error: {
        code: "ORDER_UPDATE_ERROR",
        message: "Nie udało się zaktualizować zlecenia.",
        correlationId: CORRELATION_ID_EXAMPLE,
        fieldErrors: [
          {
            field: "status",
            code: "ORDER_NOT_EDITABLE",
            message: "Zlecenie można edytować wyłącznie w statusie wersji roboczej."
          }
        ]
      }
    }
  }
};

export const SAMPLE_REGISTRATION_ERROR_EXAMPLES = {
  duplikatKoduKreskowego: {
    summary: "Kod kreskowy jest już użyty (DUPLICATE_BARCODE)",
    value: {
      error: {
        code: "SAMPLE_REGISTRATION_ERROR",
        message: "Nie udało się zarejestrować próbki.",
        correlationId: CORRELATION_ID_EXAMPLE,
        fieldErrors: [
          {
            field: "barcode",
            code: "DUPLICATE_BARCODE",
            message: "Kod kreskowy jest już użyty w tej placówce."
          }
        ]
      }
    }
  },
  dataPobraniaWPrzyszlosci: {
    summary: "Data pobrania w przyszłości (COLLECTED_AT_IN_FUTURE)",
    value: {
      error: {
        code: "SAMPLE_REGISTRATION_ERROR",
        message: "Nie udało się zarejestrować próbki.",
        correlationId: CORRELATION_ID_EXAMPLE,
        fieldErrors: [
          {
            field: "collectedAt",
            code: "COLLECTED_AT_IN_FUTURE",
            message: "Data pobrania nie może być w przyszłości."
          }
        ]
      }
    }
  },
  dataPobraniaPrzedZleceniem: {
    summary: "Data pobrania wcześniejsza niż utworzenie zlecenia (COLLECTED_AT_BEFORE_ORDER)",
    value: {
      error: {
        code: "SAMPLE_REGISTRATION_ERROR",
        message: "Nie udało się zarejestrować próbki.",
        correlationId: CORRELATION_ID_EXAMPLE,
        fieldErrors: [
          {
            field: "collectedAt",
            code: "COLLECTED_AT_BEFORE_ORDER",
            message: "Data pobrania nie może być wcześniejsza niż utworzenie zlecenia."
          }
        ]
      }
    }
  }
};
