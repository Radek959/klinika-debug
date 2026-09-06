import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import type { MaterialType, OrderDetailsResponse } from "@klinika/api-contracts";
import type { ApiFieldError } from "../api/client";
import { ApiClientError, getOrder, registerSample, sendOrderToLab } from "../api/client";
import { PageHeader } from "../layout/AppLayout";
import { formatDateTime } from "../ui/dates";
import {
  materialTypeLabels,
  orderPriorityLabels,
  orderStatusLabels,
  resultFlagLabels,
  sampleStatusLabels
} from "../ui/labels";

export function OrderDetailsPage({ token }: { token: string }) {
  const { orderId } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState<OrderDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(
    (location.state as { message?: string } | null)?.message ?? null
  );
  const requestId = useRef(0);

  const reload = useCallback(() => {
    if (!orderId) {
      return;
    }
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setIsLoading(true);
    setLoadError(null);
    void getOrder(token, orderId)
      .then((response) => {
        if (requestId.current === currentRequest) {
          setOrder(response);
        }
      })
      .catch((caught) => {
        if (requestId.current === currentRequest) {
          setLoadError(toApiMessage(caught, "Nie udało się pobrać danych zlecenia."));
        }
      })
      .finally(() => {
        if (requestId.current === currentRequest) {
          setIsLoading(false);
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
        <p>{loadError}</p>
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
        title={`Zlecenie: ${order.patient.firstName} ${order.patient.lastName}`}
        actions={
          <Link className="secondary-link" to="/orders">
            Wróć do listy
          </Link>
        }
      >
        <p>
          <span className="status-badge">{orderStatusLabels[order.status]}</span>{" "}
          · Priorytet: {orderPriorityLabels[order.priority]}
        </p>
      </PageHeader>

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
              {test.name} ({test.code}) — {materialTypeLabels[test.materialType]}
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
                <th>Rejestracja</th>
              </tr>
            </thead>
            <tbody>
              {order.samples.map((sample) => (
                <SampleRow
                  key={sample.materialType}
                  token={token}
                  orderId={order.id}
                  materialType={sample.materialType}
                  status={sample.status}
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
        />
      ) : null}

      {order.externalOrderId ? (
        <section className="data-section">
          <h2>Integracja z laboratorium</h2>
          <dl className="data-list">
            <div className="data-row">
              <dt>Identyfikator zewnętrzny</dt>
              <dd>{order.externalOrderId}</dd>
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
          <p className="muted">Brak wyników. Wyniki pojawią się automatycznie po ich odebraniu.</p>
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
    </>
  );
}

function SampleRow({
  token,
  orderId,
  materialType,
  status,
  onRegistered
}: {
  token: string;
  orderId: string;
  materialType: MaterialType;
  status: string;
  onRegistered: () => void;
}) {
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
              disabled={isSubmitting || !barcode}
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

function SendToLabAction({
  token,
  orderId,
  onSent
}: {
  token: string;
  orderId: string;
  onSent: () => void;
}) {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setIsSending(true);
    setError(null);
    try {
      await sendOrderToLab(token, orderId);
      onSent();
    } catch (caught) {
      setError(toApiMessage(caught, "Nie udało się wysłać zlecenia do laboratorium."));
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
          {error}
        </p>
      ) : null}
    </section>
  );
}

function toLocalDateTimeInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function toApiMessage(caught: unknown, fallback: string) {
  if (caught instanceof ApiClientError) {
    return caught.message;
  }
  return fallback;
}
