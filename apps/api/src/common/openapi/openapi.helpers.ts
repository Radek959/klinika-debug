import { applyDecorators } from "@nestjs/common";
import { ApiHeader, ApiParam, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { ApiErrorResponseDto } from "../errors/api-error-response.dto";

/**
 * Wspólny opis nagłówka `X-Correlation-ID` dla operacji participant API.
 * Reużywalne, żeby nie powtarzać tego samego tekstu w każdym kontrolerze
 * (patrz `docs/ai/backend-playbook.md` — OpenAPI musi być po polsku i opisywać
 * realny kontrakt).
 */
export function ApiCorrelationIdHeader() {
  return applyDecorators(
    ApiHeader({
      name: "X-Correlation-ID",
      required: false,
      description:
        "Opcjonalny identyfikator korelacji żądania. Jeżeli klient go poda, musi to być poprawny UUID. " +
        "API zawsze zwraca identyfikator korelacji w nagłówku odpowiedzi X-Correlation-ID, a w przypadku " +
        "błędu ta sama wartość znajduje się też w polu error.correlationId."
    })
  );
}

const SESSION_EXPIRED_EXAMPLE = {
  sessionExpired: {
    summary: "Sesja wygasła albo token jest nieprawidłowy",
    value: {
      error: {
        code: "SESSION_EXPIRED",
        message: "Sesja wygasła albo token jest nieprawidłowy.",
        correlationId: "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7"
      }
    }
  }
};

/**
 * Wspólna odpowiedź 401 dla endpointów chronionych tokenem sesji (Bearer).
 * Token sesji NIE jest JWT-em — patrz opis Bearer auth w `app.setup.ts`.
 */
export function ApiSessionUnauthorizedResponse() {
  return applyDecorators(
    ApiUnauthorizedResponse({
      type: ApiErrorResponseDto,
      description:
        "Brak tokenu Bearer, token jest nieprawidłowy albo sesja wygasła.",
      examples: SESSION_EXPIRED_EXAMPLE
    })
  );
}

/**
 * Opis parametru `patientId` wspólny dla wszystkich publicznych operacji.
 * Wartość jest syntetycznym, neutralnym przykładem — identyfikator NIE jest
 * przewidywalny i należy go pobrać z odpowiedzi API (lista/utworzenie pacjenta).
 */
export function ApiPatientIdParam() {
  return applyDecorators(
    ApiParam({
      name: "patientId",
      description:
        "Identyfikator pacjenta z bieżącego workspace'u. Pobierz go z odpowiedzi " +
        "POST /api/v1/patients albo GET /api/v1/patients. Identyfikator nie jest przewidywalny.",
      example: "clpatient0001"
    })
  );
}

/**
 * Opis parametru `orderId` wspólny dla wszystkich publicznych operacji.
 */
export function ApiOrderIdParam() {
  return applyDecorators(
    ApiParam({
      name: "orderId",
      description:
        "Identyfikator zlecenia z bieżącego workspace'u. Pobierz go z odpowiedzi " +
        "POST /api/v1/orders albo GET /api/v1/orders. Identyfikator nie jest przewidywalny.",
      example: "clorder0001"
    })
  );
}
