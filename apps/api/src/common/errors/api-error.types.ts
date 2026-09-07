export interface FieldError {
  field: string;
  code: string;
  message: string;
}

/**
 * Dodatkowe, jawnie dopuszczone nagłówki odpowiedzi błędu.
 *
 * Lista jest zamknięta, żeby ścieżka błędu nie stała się dowolnym kanałem
 * ustawiania nagłówków HTTP.
 */
export interface ApiErrorResponseHeaders {
  /** Liczba pełnych sekund do momentu automatycznego ponowienia. Nigdy ujemna. */
  "Retry-After"?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    correlationId: string;
    fieldErrors?: FieldError[];
  };
}
