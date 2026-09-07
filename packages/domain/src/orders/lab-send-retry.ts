/**
 * Reguły automatycznego ponawiania wysyłki zlecenia do laboratorium.
 *
 * Dokumentacja produktowa (`docs/dokumentacja-produktowa.md`, sekcja 13.2)
 * definiuje docelowo maksymalnie trzy ponowienia po 15, 30 i 60 sekundach dla
 * odpowiedzi `429`, `5xx` i timeoutu. Ten moduł jest jedynym źródłem tego
 * harmonogramu — zarówno API, jak i scheduler liczą terminy z tych samych
 * stałych, więc nie da się rozjechać opóźnień między warstwami.
 *
 * Scenariusz `RATE_LIMIT` zwraca `429` wyłącznie dla pierwszej próby, a druga
 * (automatyczna) próba jest przyjmowana jak `SUCCESS`. Scenariusz `SERVER_ERROR`
 * zużywa trzy automatyczne ponowienia, po czym zamyka zlecenie statusem
 * `TECHNICAL_ERROR`.
 */

/**
 * Opóźnienia kolejnych automatycznych ponowień w sekundach.
 *
 * Indeks 0 dotyczy pierwszego ponowienia (czyli drugiej próby wysyłki).
 */
export const LAB_SEND_RETRY_DELAYS_SECONDS = [15, 30, 60] as const;

/** Maksymalna liczba automatycznych ponowień przewidziana w dokumentacji. */
export const MAX_LAB_SEND_RETRY_COUNT = LAB_SEND_RETRY_DELAYS_SECONDS.length;

/** Numer pierwszej, ręcznej próby wysyłki. */
export const FIRST_LAB_SEND_ATTEMPT_NUMBER = 1;

/**
 * Opóźnienie przed ponownym podjęciem zadania, którego WYKONANIE zakończyło się
 * błędem technicznym (np. chwilowa awaria bazy).
 *
 * To nie jest opóźnienie kolejnej próby wysyłki do laboratorium — numer próby
 * (`attemptNumber`) się wtedy nie zmienia. Chodzi wyłącznie o to, żeby zadanie
 * zwrócone do `PENDING` nie było natychmiast znowu wymagalne: bez nowego terminu
 * scheduler podejmowałby je przy każdym ticku (co ~2 s) w nieskończonej,
 * gorącej pętli.
 *
 * Wartość jest celowo nie mniejsza niż najkrótsze opóźnienie harmonogramu
 * ponowień (15 s) i wyraźnie większa niż okres odpytywania schedulera.
 */
export const LAB_SEND_RETRY_FAILURE_BACKOFF_SECONDS = 15;

/**
 * Bezpieczny, stały komunikat techniczny zapisywany w `lastError` po nieudanym
 * wykonaniu zadania.
 *
 * Treść jest STAŁA i nie zawiera żadnego fragmentu oryginalnego wyjątku:
 * komunikat błędu może zawierać dane pacjenta, kod kreskowy, fragment zapytania
 * SQL albo stack trace, a kolumna `lastError` jest częścią danych aplikacji.
 * Szczegóły diagnostyczne trafiają wyłącznie do logu serwera.
 */
export const LAB_SEND_RETRY_FAILURE_MESSAGE =
  "Techniczny błąd wykonania zadania ponowienia wysyłki.";

/**
 * Wynik zakończonego automatycznego ponowienia wysyłki.
 *
 * `CANCELLED` oznacza, że ponowienie NIE zostało wykonane, ponieważ warunki
 * biznesowe albo dane objęte hashem zmieniły się od pierwszej próby.
 */
export type LabSendRetryOutcome =
  | "SCHEDULED"
  | "FAILED_RETRY"
  | "ACCEPTED"
  | "CANCELLED"
  | "EXHAUSTED";

/**
 * Bezpieczny kod przyczyny anulowania automatycznego ponowienia.
 *
 * Kody są zamkniętym zbiorem wartości technicznych — nie zawierają danych
 * pacjenta, treści payloadu wysyłki ani nazwy scenariusza symulatora.
 */
export type LabSendRetryCancellationReason = "PATIENT_INACTIVE" | "REQUEST_CHANGED";

/**
 * Wylicza nowy termin wykonania zadania zwróconego do `PENDING` po błędzie
 * technicznym.
 *
 * Termin jest liczony z jawnie przekazanego `now`, żeby wynik był w pełni
 * deterministyczny i testowalny.
 */
export function computeLabSendRetryFailureExecuteAt(input: { now: Date }): Date {
  return new Date(input.now.getTime() + LAB_SEND_RETRY_FAILURE_BACKOFF_SECONDS * 1000);
}

export const LAB_RATE_LIMITED_ERROR_CODE = "LAB_RATE_LIMITED";

export const LAB_RATE_LIMITED_MESSAGE =
  "Laboratorium chwilowo ograniczyło liczbę żądań. Wysyłka zostanie ponowiona automatycznie.";

export const LAB_SERVER_ERROR_CODE = "LAB_SERVER_ERROR";

export const LAB_SERVER_ERROR_MESSAGE =
  "Laboratorium jest chwilowo niedostępne. Wysyłka zostanie ponowiona automatycznie.";

export const LAB_SEND_RETRY_EXHAUSTED_REASON =
  "Automatyczne ponowienia wysyłki do laboratorium zostały wyczerpane.";

/**
 * Zwraca opóźnienie przed próbą o podanym numerze.
 *
 * `attemptNumber` to numer PRÓBY WYSYŁKI, a nie numer ponowienia: próba 1 jest
 * ręczna i nie ma opóźnienia (`null`), próba 2 czeka 15 s, próba 3 — 30 s,
 * próba 4 — 60 s. Próba spoza harmonogramu zwraca `null`, co oznacza wyczerpanie
 * dozwolonych ponowień (obsługa tego przypadku jest poza zakresem tego etapu).
 */
export function getLabSendRetryDelaySeconds(attemptNumber: number): number | null {
  if (!Number.isInteger(attemptNumber) || attemptNumber < 2) {
    return null;
  }

  const delay = LAB_SEND_RETRY_DELAYS_SECONDS[attemptNumber - 2];
  return delay ?? null;
}

/** Czy próba o podanym numerze mieści się jeszcze w harmonogramie ponowień. */
export function canScheduleLabSendRetry(attemptNumber: number): boolean {
  return getLabSendRetryDelaySeconds(attemptNumber) !== null;
}

/**
 * Wylicza moment wykonania automatycznego ponowienia dla podanej próby.
 *
 * Termin jest wyliczany z jawnie przekazanego `now`, a nie z zegara wewnątrz
 * funkcji, żeby wynik był w pełni deterministyczny i testowalny.
 */
export function computeLabSendRetryExecuteAt(input: {
  now: Date;
  attemptNumber: number;
}): Date | null {
  const delaySeconds = getLabSendRetryDelaySeconds(input.attemptNumber);
  if (delaySeconds === null) {
    return null;
  }

  return new Date(input.now.getTime() + delaySeconds * 1000);
}

/**
 * Wylicza wartość nagłówka `Retry-After` jako pełną liczbę sekund.
 *
 * Nagłówek nigdy nie może być ujemny: zadanie, którego termin już minął, czeka
 * wyłącznie na najbliższy przebieg schedulera, więc zwracamy `0`. Pozostały czas
 * jest zaokrąglany w górę, żeby klient nie ponowił żądania zbyt wcześnie.
 */
export function computeRetryAfterSeconds(input: { now: Date; executeAt: Date }): number {
  const remainingMs = input.executeAt.getTime() - input.now.getTime();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return 0;
  }

  return Math.ceil(remainingMs / 1000);
}
