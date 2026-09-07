import { HttpException, HttpStatus } from "@nestjs/common";
import type { ApiErrorResponseHeaders, FieldError } from "./api-error.types";

export class ApiErrorException extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    readonly fieldErrors?: FieldError[],
    /**
     * Dodatkowe nagłówki odpowiedzi błędu (np. `Retry-After` przy HTTP 429).
     *
     * Kontrakt jest celowo wąski i typowany — to małe rozszerzenie istniejącego
     * jednolitego formatu błędów, a nie osobny system odpowiedzi HTTP. Nagłówki
     * nie trafiają do treści odpowiedzi: filtr buduje ciało błędu wyłącznie z
     * `code`, `message`, `correlationId` i `fieldErrors`.
     */
    readonly responseHeaders?: ApiErrorResponseHeaders
  ) {
    super({ code, message, fieldErrors, responseHeaders }, status);
  }
}
