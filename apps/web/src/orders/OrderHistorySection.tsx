import { useCallback, useEffect, useRef, useState } from "react";
import type { OrderHistoryEventDetails, OrderHistoryItem } from "@klinika/api-contracts";
import { ApiClientError, getOrderHistory } from "../api/client";
import { formatDateTime } from "../ui/dates";
import {
  materialTypeLabels,
  orderHistoryActorTypeLabels,
  orderHistoryEventTypeLabels,
  orderPriorityLabels,
  orderStatusLabels
} from "../ui/labels";

const PAGE_SIZE = 20;

export function OrderHistorySection({
  token,
  orderId,
  refreshKey
}: {
  token: string;
  orderId: string;
  refreshKey: number;
}) {
  const [items, setItems] = useState<OrderHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadFirstPage = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    void getOrderHistory(token, orderId, { page: 1, pageSize: PAGE_SIZE }, controller.signal)
      .then((response) => {
        if (abortRef.current !== controller) {
          return;
        }
        setItems(response.items);
        setPage(response.meta.page);
        setTotal(response.meta.total);
      })
      .catch((caught) => {
        if (abortRef.current !== controller || isAbortError(caught)) {
          return;
        }
        setError(toApiMessage(caught, "Nie udało się pobrać historii operacji."));
      })
      .finally(() => {
        if (abortRef.current === controller) {
          setIsLoading(false);
        }
      });
  }, [token, orderId]);

  useEffect(() => {
    loadFirstPage();
    return () => {
      abortRef.current?.abort();
    };
  }, [loadFirstPage, refreshKey]);

  async function loadMore() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoadingMore(true);
    setError(null);

    try {
      const response = await getOrderHistory(
        token,
        orderId,
        { page: page + 1, pageSize: PAGE_SIZE },
        controller.signal
      );
      if (abortRef.current !== controller) {
        return;
      }
      setItems((current) => [...current, ...response.items]);
      setPage(response.meta.page);
      setTotal(response.meta.total);
    } catch (caught) {
      if (abortRef.current !== controller || isAbortError(caught)) {
        return;
      }
      setError(toApiMessage(caught, "Nie udało się pobrać starszych zdarzeń."));
    } finally {
      if (abortRef.current === controller) {
        setIsLoadingMore(false);
      }
    }
  }

  const hasMore = items.length < total;

  return (
    <section className="data-section">
      <h2>Historia operacji</h2>

      {isLoading ? <p className="muted">Ładowanie historii operacji...</p> : null}

      {!isLoading && error && items.length === 0 ? (
        <div>
          <p className="form-error" role="alert">
            {error}
          </p>
          <button type="button" className="secondary-button" onClick={loadFirstPage}>
            Spróbuj ponownie
          </button>
        </div>
      ) : null}

      {!isLoading && !error && items.length === 0 ? (
        <p className="muted">Brak zarejestrowanych zdarzeń dla tego zlecenia.</p>
      ) : null}

      {!isLoading && items.length > 0 ? (
        <>
          <ul className="history-timeline">
            {items.map((item) => (
              <HistoryEntryCard key={item.id} item={item} />
            ))}
          </ul>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          {hasMore ? (
            <div className="history-load-more">
              <button
                type="button"
                className="secondary-button"
                disabled={isLoadingMore}
                onClick={loadMore}
              >
                {isLoadingMore ? "Wczytywanie..." : "Pokaż starsze"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function HistoryEntryCard({ item }: { item: OrderHistoryItem }) {
  const actorLabel = describeActor(item);
  const description = describeDetails(item.details);
  const isReconstructed = "reconstructed" in item.details && item.details.reconstructed === true;

  return (
    <li className="history-entry">
      <div className="history-entry-header">
        <p className="history-entry-title">{orderHistoryEventTypeLabels[item.eventType]}</p>
        <span className="history-entry-time">{formatDateTime(item.occurredAt)}</span>
      </div>
      <p className="history-entry-meta">Wykonawca: {actorLabel}</p>
      {description ? <p className="history-entry-meta">{description}</p> : null}
      {item.previousStatus && item.newStatus && item.previousStatus !== item.newStatus ? (
        <p className="history-entry-status-change">
          Zmiana statusu: {orderStatusLabels[item.previousStatus]} → {orderStatusLabels[item.newStatus]}
        </p>
      ) : null}
      {item.previousStatus && item.newStatus && item.previousStatus === item.newStatus ? (
        // Zdarzenia takie jak odrzucenie zlecenia przez laboratorium nie zmieniają
        // statusu; wyświetlanie „X → X” byłoby dla personelu mylące.
        <p className="history-entry-status-change">
          Status zlecenia bez zmian: {orderStatusLabels[item.newStatus]}
        </p>
      ) : null}
      {item.correlationId ? (
        <p className="history-entry-meta">
          Correlation ID: <span className="history-id">{item.correlationId}</span>
        </p>
      ) : null}
      {item.integrationEventId ? (
        <p className="history-entry-meta">
          Identyfikator zdarzenia integracji: <span className="history-id">{item.integrationEventId}</span>
        </p>
      ) : null}
      {isReconstructed ? (
        <p className="muted">
          Wpis odtworzony podczas migracji danych — szczegóły mogły zostać uproszczone.
        </p>
      ) : null}
    </li>
  );
}

function describeActor(item: OrderHistoryItem): string {
  const typeLabel = orderHistoryActorTypeLabels[item.actorType];
  if (item.actorType === "STAFF" && item.actorDisplayName) {
    return `${typeLabel} (${item.actorDisplayName})`;
  }
  return typeLabel;
}

function describeDetails(details: OrderHistoryEventDetails): string | null {
  switch (details.eventType) {
    case "ORDER_CREATED": {
      if (details.reconstructed) {
        return null;
      }
      const testCodes = details.testCodes?.join(", ") ?? "brak danych";
      const priority = details.priority ? orderPriorityLabels[details.priority] : "brak danych";
      return `Priorytet: ${priority}. Badania: ${testCodes}.`;
    }
    case "ORDER_UPDATED": {
      const parts: string[] = [];
      if (details.patientChanged) {
        parts.push("zmieniono pacjenta");
      }
      if (details.previousPriority && details.newPriority) {
        parts.push(
          `priorytet: ${orderPriorityLabels[details.previousPriority]} → ${orderPriorityLabels[details.newPriority]}`
        );
      }
      if (details.addedTestCodes.length) {
        parts.push(`dodane badania: ${details.addedTestCodes.join(", ")}`);
      }
      if (details.removedTestCodes.length) {
        parts.push(`usunięte badania: ${details.removedTestCodes.join(", ")}`);
      }
      return parts.length ? capitalize(parts.join("; ")) + "." : "Brak zmian merytorycznych.";
    }
    case "SAMPLE_REGISTERED":
      return `Materiał: ${materialTypeLabels[details.materialType]}.`;
    case "ORDER_SENT_TO_LAB":
      return "Zlecenie zostało przekazane do laboratorium.";
    case "LAB_ORDER_ACCEPTED":
      return `Identyfikator zewnętrzny: ${details.externalOrderId}. Szacowane zakończenie: ${formatDateTime(details.estimatedCompletionAt)}.`;
    case "LAB_RESULT_RECEIVED": {
      const testCodes = details.testCodes.join(", ");
      const statusLabel = details.callbackStatus === "COMPLETED" ? "kompletny" : "częściowy";
      return `Wynik (${statusLabel}) dla: ${testCodes || "brak kodów"}. Liczba wyników: ${details.resultCount}.`;
    }
    case "LAB_SAMPLE_REJECTED": {
      const rejectedSamples = details.rejectedSamples ?? [];
      const parts: string[] = [];
      if (rejectedSamples.length) {
        // Kontrakt dopuszcza odrzucenie wielu próbek jednym callbackiem, więc oś
        // czasu wymienia każdy odrzucony materiał razem z jego przyczyną.
        parts.push(
          `Odrzucone materiały: ${rejectedSamples
            .map(
              (sample) =>
                `${materialTypeLabels[sample.materialType]} — ${sample.rejectionReason} (${sample.rejectionCode})`
            )
            .join("; ")}`
        );
      }
      if (details.rejectedTestCodes.length) {
        parts.push(`Badania odrzucone: ${details.rejectedTestCodes.join(", ")}`);
      }
      if (details.completedTestCodes.length) {
        parts.push(`Badania wykonane: ${details.completedTestCodes.join(", ")}`);
      }
      return parts.length ? `${parts.join(". ")}.` : null;
    }
    case "LAB_ORDER_REJECTED": {
      // Oś czasu pokazuje wyłącznie polskie komunikaty z bezpiecznego kontraktu
      // historii — bez technicznych kodów błędów i bez nazwy trybu symulatora.
      const parts = ["Zlecenie nie przeszło walidacji po stronie laboratorium."];
      const messages = (details.fieldErrors ?? [])
        .map((fieldError) => fieldError.message)
        .filter(Boolean);
      if (messages.length) {
        parts.push(`Zgłoszone uwagi: ${messages.join(" ")}`);
      }
      return parts.join(" ");
    }
    case "LAB_RATE_LIMIT_RECEIVED": {
      // Oś czasu opisuje ograniczenie przepustowości jako sytuację przejściową,
      // poprawnie obsłużoną przez aplikację — bez technicznego kodu błędu.
      const parts = [
        "Laboratorium chwilowo ograniczyło liczbę żądań. Wysyłka zostanie ponowiona automatycznie."
      ];
      if (details.nextRetryAt) {
        parts.push(`Zaplanowana kolejna próba: ${formatDateTime(details.nextRetryAt)}.`);
      }
      return parts.join(" ");
    }
    case "LAB_SEND_RETRY":
      return `Automatyczna próba nr ${details.attemptNumber} zakończona przyjęciem zlecenia przez laboratorium.`;
    case "TECHNICAL_ERROR":
      return details.reason;
    default:
      return null;
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function toApiMessage(caught: unknown, fallback: string): string {
  if (caught instanceof ApiClientError) {
    return caught.message;
  }
  return fallback;
}
