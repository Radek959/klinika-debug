/**
 * Scenariusz symulatora `VALIDATION_ERROR`: laboratorium synchronicznie odrzuca
 * zlecenie w odpowiedzi na `POST /orders/{orderId}/send`.
 *
 * W odróżnieniu od `SUCCESS`, `PARTIAL_SUCCESS` i `SAMPLE_REJECTED` ten
 * scenariusz nie jest asynchroniczny: nie powstaje `externalOrderId`, zadanie
 * `lab_jobs` ani callback. Odrzucenie jest widoczne wyłącznie jako błąd HTTP 422
 * i bezpieczny wpis historii zlecenia.
 *
 * Treść odrzucenia jest syntetyczna i deterministyczna — bez losowania, bez
 * danych pacjenta, bez kodów kreskowych i bez nazwy aktywnego scenariusza
 * symulatora. Komunikat pola jest celowo ogólny ("jedno z wybranych badań"),
 * żeby uczestnik warsztatu nie odczytał z publicznego API, jaki tryb środowiska
 * jest włączony.
 */

export const LAB_ORDER_VALIDATION_ERROR_CODE = "LAB_ORDER_VALIDATION_ERROR";

export const LAB_ORDER_VALIDATION_ERROR_MESSAGE =
  "Laboratorium odrzuciło zlecenie z powodu błędów walidacji.";

export const LAB_TEST_NOT_SUPPORTED_CODE = "LAB_TEST_NOT_SUPPORTED";

export const LAB_TEST_NOT_SUPPORTED_MESSAGE =
  "Laboratorium nie obsługuje jednego z wybranych badań.";

export interface LabOrderValidationFieldError {
  field: string;
  code: string;
  message: string;
}

export interface LabOrderValidationRejection {
  rejectionType: "VALIDATION";
  errorCode: typeof LAB_ORDER_VALIDATION_ERROR_CODE;
  message: string;
  /**
   * Badanie wskazane deterministycznie przez laboratorium (pierwsze po stabilnym
   * sortowaniu kodów badań zlecenia). Wartość jest wewnętrzna: nie występuje ani
   * w odpowiedzi HTTP, ani w szczegółach zdarzenia historii.
   */
  selectedTestCode: string | null;
  fieldErrors: LabOrderValidationFieldError[];
}

/**
 * Buduje deterministyczny opis odrzucenia walidacyjnego dla zlecenia.
 *
 * Odrzucenie dotyczy pola `tests` jako całości, a nie pojedynczej pozycji, więc
 * treść błędu jest identyczna dla każdego zlecenia i nie zdradza, które badanie
 * laboratorium uznało za nieobsługiwane. Kody badań są przyjmowane w wejściu i
 * sortowane stabilnie, żeby wynik pozostał niezależny od kolejności badań w
 * żądaniu i w bazie — także wtedy, gdy w przyszłości komunikat miałby wskazywać
 * konkretne badanie. Zlecenie bez badań nie może przejść walidacji wysyłki, ale
 * funkcja i tak zwraca ten sam, stabilny błąd zamiast rzucać wyjątkiem.
 */
export function planLabOrderValidationRejection(input: {
  testCodes: string[];
}): LabOrderValidationRejection {
  const sortedTestCodes = [...input.testCodes].sort((left, right) =>
    left.localeCompare(right)
  );

  return {
    // Pole zachowane w sygnaturze wyniku, żeby determinizm wyboru badania był
    // jawny i testowalny; nie trafia ani na wire, ani do historii zlecenia.
    selectedTestCode: sortedTestCodes[0] ?? null,
    rejectionType: "VALIDATION",
    errorCode: LAB_ORDER_VALIDATION_ERROR_CODE,
    message: LAB_ORDER_VALIDATION_ERROR_MESSAGE,
    fieldErrors: [
      {
        field: "tests",
        code: LAB_TEST_NOT_SUPPORTED_CODE,
        message: LAB_TEST_NOT_SUPPORTED_MESSAGE
      }
    ]
  };
}
