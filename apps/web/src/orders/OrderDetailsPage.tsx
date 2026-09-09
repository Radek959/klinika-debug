import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import type {
  MaterialType,
  OrderDetailsResponse,
  OrderSampleResponse,
  OrderStatus,
  OrderTestStatus
} from "@klinika/api-contracts";
import type { ApiFieldError } from "../api/client";
import { ApiClientError, getOrder, registerSample, sendOrderToLab } from "../api/client";
import { PageHeader } from "../layout/AppLayout";
import { CopyButton } from "../ui/CopyButton";
import { formatDateTime } from "../ui/dates";
import {
  materialTypeLabels,
  orderPriorityLabels,
  orderStatusLabels,
  orderTestStatusLabels,
  resultFlagLabels,
  sampleStatusLabels
} from "../ui/labels";
import { OrderHistorySection } from "./OrderHistorySection";
import { OrderProgressStepper } from "./OrderProgressStepper";

/**
 * Statusy, w których zlecenie oczekuje na laboratorium — proces jest
 * asynchroniczny, więc uczestnik może chcieć ręcznie sprawdzić, czy wynik już
 * nadszedł, zamiast odświeżać całą stronę.
 */
const LAB_WAITING_STATUSES = new Set<OrderStatus>(["SENT_TO_LAB", "PROCESSING", "PARTIAL"]);

export function OrderDetailsPage({ token }: { token: string }) {
  const { orderId } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState<OrderDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<ApiErrorInfo | null>(null);
  const [refreshError, setRefreshError] = useState<ApiErrorInfo | null>(null);
  const [success, setSuccess] = useState<string | null>(
    (location.state as { message?: string } | null)?.message ?? null
  );
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const requestId = useRef(0);

  const reload = useCallback((options?: { silent?: boolean }) => {
    if (!orderId) {
      return;
    }
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    if (options?.silent) {
      setIsRefreshing(true);
      setRefreshError(null);
    } else {
      setIsLoading(true);
      setLoadError(null);
    }
    void getOrder(token, orderId)
      .then((response) => {
        if (requestId.current === currentRequest) {
          setOrder(response);
          setHistoryRefreshKey((current) => current + 1);
          setRefreshError(null);
        }
      })
      .catch((caught) => {
        if (requestId.current === currentRequest) {
          if (options?.silent) {
            // Ręczny refresh zachowuje dotychczasowe dane zlecenia na ekranie —
            // błąd pokazujemy jako komunikat obok przycisku, bez przejścia do
            // pełnego ekranu błędu (ten jest tylko dla nieudanego pierwszego
            // wczytania, gdy nie ma jeszcze żadnych danych do pokazania).
            setRefreshError(toApiErrorInfo(caught, "Nie udało się odświeżyć statusu zlecenia."));
          } else {
            setLoadError(toApiErrorInfo(caught, "Nie udało się pobrać danych zlecenia."));
          }
        }
      })
      .finally(() => {
        if (requestId.current === currentRequest) {
          if (options?.silent) {
            setIsRefreshing(false);
          } else {
            setIsLoading(false);
          }
        }
      });
  }, [orderId, token]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (isLoading) {
    return <p className="muted">Ładowanie danych zlecenia...</p>;
  }

  if (loadError && !order) {
    return (
      <section className="empty-state" role="alert">
        <h1>Nie udało się wczytać zlecenia</h1>
        <p>{loadError.message}</p>
        {loadError.correlationId ? (
          <p className="muted">
            Identyfikator błędu:{" "}
            <span className="history-id">{loadError.correlationId}</span>{" "}
            <CopyButton value={loadError.correlationId} />
          </p>
        ) : null}
        <Link to="/orders">Wróć do listy</Link>
      </section>
    );
  }

  if (!order) {
    return null;
  }

  return (
    <>
      <PageHeader
        title={
          <>
            Zlecenie:{" "}
            <Link className="page-header-patient-link" to={`/patients/${order.patientId}`}>
              {order.patient.firstName} {order.patient.lastName}
            </Link>
          </>
        }
        actions={
          <>
            {order.status === "DRAFT" ? (
              <Link className="button-link" to={`/orders/${order.id}/edit`}>
                Edytuj zlecenie
              </Link>
            ) : null}
            {LAB_WAITING_STATUSES.has(order.status) ? (
              <button
                type="button"
                className="secondary-button"
                disabled={isRefreshing}
                onClick={() => reload({ silent: true })}
              >
                {isRefreshing ? "Odświeżanie..." : "Odśwież status"}
              </button>
            ) : null}
            <Link className="secondary-link" to="/orders">
              Wróć do listy
            </Link>
          </>
        }
      >
        <p>
          <span className="status-badge">{orderStatusLabels[order.status]}</span>{" "}
          · Priorytet: {orderPriorityLabels[order.priority]}
        </p>
      </PageHeader>

      {refreshError ? (
        <p className="form-error" role="alert">
          {refreshError.message}
        </p>
      ) : null}

      <OrderProgressStepper status={order.status} />

      {success ? (
        <p className="form-success" role="status" aria-live="polite">
          {success}
        </p>
      ) : null}

      <section className="data-section">
        <h2>Badania</h2>
        <ul>
          {order.tests.map((test) => (
            <li key={test.medicalTestId}>
              {test.name} ({test.code}) — {materialTypeLabels[test.materialType]} —{" "}
              <span className="status-badge">{orderTestStatusLabels[test.status]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="data-section">
        <h2>Próbki</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Materiał</th>
                <th>Status</th>
                <th>Przyczyna odrzucenia</th>
                <th>Rejestracja</th>
              </tr>
            </thead>
            <tbody>
              {order.samples.map((sample) => (
                <SampleRow
                  key={sample.materialType}
                  token={token}
                  orderId={order.id}
                  sample={sample}
                  onRegistered={() => {
                    setSuccess("Próbka została zarejestrowana.");
                    reload();
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {order.status === "SAMPLE_COLLECTED" ? (
        <SendToLabAction
          token={token}
          orderId={order.id}
          onSent={() => {
            setSuccess("Zlecenie zostało wysłane do laboratorium.");
            reload();
          }}
          onHistoryRecorded={() => {
            // Kontrolowana odmowa laboratorium (429 / 422 / 503) NIE jest sukcesem —
            // komunikat błędu zostaje, a status zlecenia się nie zmienia. Backend
            // zapisał jednak wpis historii, więc odświeżamy WYŁĄCZNIE sekcję
            // historii: bez przeładowania strony, bez pobierania szczegółów
            // zlecenia i bez pollingu.
            setHistoryRefreshKey((current) => current + 1);
          }}
        />
      ) : null}

      {order.externalOrderId ? (
        <section className="data-section">
          <h2>Integracja z laboratorium</h2>
          <dl className="data-list">
            <div className="data-row">
              <dt>Identyfikator zewnętrzny</dt>
              <dd>
                {order.externalOrderId} <CopyButton value={order.externalOrderId} />
              </dd>
            </div>
            <div className="data-row">
              <dt>Wysłano</dt>
              <dd>{formatDateTime(order.sentAt)}</dd>
            </div>
            <div className="data-row">
              <dt>Przewidywane zakończenie</dt>
              <dd>{formatDateTime(order.estimatedCompletionAt)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="data-section">
        <h2>Wyniki</h2>
        {order.results.length === 0 ? (
          <p className="muted">{describeMissingResults(order)}</p>
        ) : (
          order.results.map((result) => {
            const test = order.tests.find((item) => item.medicalTestId === result.medicalTestId);
            return (
              <div key={result.medicalTestId} className="result-card">
                <h3>{test ? `${test.name} (${test.code})` : result.medicalTestId}</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Parametr</th>
                        <th>Wartość</th>
                        <th>Jednostka</th>
                        <th>Zakres referencyjny</th>
                        <th>Oznaczenie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.parameters.map((parameter) => (
                        <tr key={parameter.code}>
                          <td>{parameter.code}</td>
                          <td>{parameter.value}</td>
                          <td>{parameter.unit ?? "Nie podano"}</td>
                          <td>{parameter.referenceRange ?? "Nie podano"}</td>
                          <td>{resultFlagLabels[parameter.flag]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </section>

      <OrderHistorySection token={token} orderId={order.id} refreshKey={historyRefreshKey} />
    </>
  );
}

function SampleRow({
  token,
  orderId,
  sample,
  onRegistered
}: {
  token: string;
  orderId: string;
  sample: OrderSampleResponse;
  onRegistered: () => void;
}) {
  const materialType: MaterialType = sample.materialType;
  const status = sample.status;
  const [barcode, setBarcode] = useState("");
  const [collectedAt, setCollectedAt] = useState(() => toLocalDateTimeInputValue(new Date()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ApiFieldError[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setIsSubmitting(true);
    setFieldErrors([]);
    setError(null);
    try {
      await registerSample(token, orderId, {
        materialType,
        barcode,
        collectedAt: new Date(collectedAt).toISOString()
      });
      onRegistered();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setFieldErrors(caught.fieldErrors);
        setError(caught.message);
      } else {
        setError("Nie udało się zarejestrować próbki.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <tr>
      <td>{materialTypeLabels[materialType]}</td>
      <td>
        <span className="status-badge">
          {sampleStatusLabels[status as keyof typeof sampleStatusLabels] ?? status}
        </span>
      </td>
      <td>
        {status === "REJECTED" && sample.rejectionReason ? (
          <span>
            {sample.rejectionReason}
            {sample.rejectionCode ? ` (${sample.rejectionCode})` : ""}
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        {status === "REQUIRED" ? (
          <div className="sample-form">
            <label>
              Kod kreskowy
              <input value={barcode} onChange={(event) => setBarcode(event.target.value)} />
            </label>
            <label>
              Czas pobrania
              <input
                type="datetime-local"
                value={collectedAt}
                onChange={(event) => setCollectedAt(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="secondary-button"
              disabled={isSubmitting || !barcode || !collectedAt}
              onClick={submit}
            >
              {isSubmitting ? "Rejestrowanie..." : "Zarejestruj próbkę"}
            </button>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            {fieldErrors.map((fieldError) => (
              <p key={fieldError.code} className="form-error" role="alert">
                {fieldError.message}
              </p>
            ))}
          </div>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
    </tr>
  );
}

/**
 * Kody kontrolowanych odmów wysyłki, przy których backend ZAPISUJE wpis historii
 * zlecenia mimo zwrócenia błędu.
 *
 * `LAB_RATE_LIMITED` (429) zapisuje `LAB_RATE_LIMIT_RECEIVED`,
 * `LAB_SERVER_ERROR` (503) — `LAB_SEND_RETRY`, a
 * `LAB_ORDER_VALIDATION_ERROR` (422) — `LAB_ORDER_REJECTED`. Tylko dla tych
 * przypadków ma sens odświeżenie historii. Zwykły błąd sieci, 401, 404, konflikt
 * idempotencji ani lokalna walidacja (`ORDER_SEND_ERROR`) nie zapisują niczego,
 * więc nie wywołują niepotrzebnego żądania.
 */
const HISTORY_RECORDING_SEND_ERROR_CODES = new Set([
  "LAB_RATE_LIMITED",
  "LAB_SERVER_ERROR",
  "LAB_ORDER_VALIDATION_ERROR"
]);

function recordsSendHistory(caught: unknown): boolean {
  return (
    caught instanceof ApiClientError &&
    caught.code !== undefined &&
    HISTORY_RECORDING_SEND_ERROR_CODES.has(caught.code)
  );
}

function SendToLabAction({
  token,
  orderId,
  onSent,
  onHistoryRecorded
}: {
  token: string;
  orderId: string;
  onSent: () => void;
  onHistoryRecorded: () => void;
}) {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ApiFieldError[]>([]);

  async function send() {
    setIsSending(true);
    setError(null);
    setRetryNotice(null);
    setFieldErrors([]);
    try {
      await sendOrderToLab(token, orderId);
      onSent();
    } catch (caught) {
      // Laboratorium może odrzucić poprawne zlecenie (HTTP 422), chwilowo
      // ograniczyć liczbę żądań (HTTP 429) albo zwrócić kontrolowany błąd 5xx.
      // Pokazujemy polski komunikat i
      // szczegóły pól, ale nigdy technicznego kodu błędu ani nazwy aktywnego
      // trybu symulatora. Przycisk wysyłki zostaje aktywny — żaden z tych
      // przypadków nie blokuje zlecenia.
      setError(toApiErrorInfo(caught, "Nie udało się wysłać zlecenia do laboratorium."));
      setFieldErrors(caught instanceof ApiClientError ? caught.fieldErrors : []);
      setRetryNotice(describeAutomaticRetry(caught));

      // Backend zapisał wpis historii dla tej odmowy, więc oś czasu jest już
      // nieaktualna. Odświeżamy ją bez pokazywania fałszywego sukcesu.
      if (recordsSendHistory(caught)) {
        onHistoryRecorded();
      }
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="data-section">
      <button type="button" className="primary-button" disabled={isSending} onClick={send}>
        {isSending ? "Wysyłanie..." : "Wyślij do laboratorium"}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error.message}
        </p>
      ) : null}
      {error?.correlationId ? (
        <p className="muted">
          Identyfikator błędu: <span className="history-id">{error.correlationId}</span>{" "}
          <CopyButton value={error.correlationId} />
        </p>
      ) : null}
      {retryNotice ? (
        <p className="form-error" role="status">
          {retryNotice}
        </p>
      ) : null}
      {fieldErrors.length ? (
        <ul className="form-error-list">
          {fieldErrors.map((fieldError) => (
            <li key={`${fieldError.field}:${fieldError.code}`} className="form-error" role="alert">
              {fieldError.message}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Uzupełnia komunikat o przejściowym problemie laboratorium informacją, kiedy
 * nastąpi automatyczne ponowienie.
 *
 * Komunikat główny („Wysyłka zostanie ponowiona automatycznie.”) pochodzi z API,
 * a tutaj dokładamy wyłącznie czas najbliższej próby odczytany z nagłówka
 * `Retry-After`. Bez odczytanej wartości nie podajemy zmyślonej liczby sekund —
 * pokazujemy sam fakt automatycznego ponowienia. Interfejs nie pokazuje kodów
 * `LAB_RATE_LIMITED` / `LAB_SERVER_ERROR` ani nazwy scenariusza symulatora.
 */
function describeAutomaticRetry(caught: unknown): string | null {
  if (
    !(caught instanceof ApiClientError) ||
    (caught.status !== 429 && caught.status !== 503)
  ) {
    return null;
  }

  const seconds = caught.retryAfterSeconds;
  if (seconds === undefined) {
    return "Kolejna próba zostanie wykonana automatycznie.";
  }

  return `Kolejna próba za około ${seconds} ${describeSecondsUnit(seconds)}.`;
}

/** Polska odmiana słowa „sekunda” dla liczby sekund w komunikacie. */
function describeSecondsUnit(seconds: number): string {
  if (seconds === 1) {
    return "sekundę";
  }

  const lastDigit = seconds % 10;
  const lastTwoDigits = seconds % 100;
  const usesFewForm =
    lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14);

  return usesFewForm ? "sekundy" : "sekund";
}

/**
 * Zlecenie odrzucone przez laboratorium nigdy nie doczeka się już wyników dla
 * badań zależnych od odrzuconego materiału, więc domyślny komunikat
 * "wyniki pojawią się automatycznie" byłby dla personelu mylący.
 */
function describeMissingResults(order: OrderDetailsResponse): string {
  const hasRejectedTests = order.tests.some(
    (test) => (test.status as OrderTestStatus) === "REJECTED"
  );
  if (order.status === "REJECTED" || hasRejectedTests) {
    return "Brak wyników — laboratorium odrzuciło wymagane próbki.";
  }
  if (order.status === "TECHNICAL_ERROR") {
    return "Brak wyników — komunikacja z laboratorium zakończyła się błędem technicznym po automatycznych ponowieniach.";
  }
  return "Brak wyników. Wyniki pojawią się automatycznie po ich odebraniu.";
}

function toLocalDateTimeInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

interface ApiErrorInfo {
  message: string;
  correlationId?: string;
}

function toApiErrorInfo(caught: unknown, fallback: string): ApiErrorInfo {
  if (caught instanceof ApiClientError) {
    return { message: caught.message, correlationId: caught.correlationId };
  }
  return { message: fallback };
}
