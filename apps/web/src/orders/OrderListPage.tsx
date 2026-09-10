import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { OrderListItem, OrdersListResponse } from "@klinika/api-contracts";
import { ApiClientError, listOrders } from "../api/client";
import { PageHeader } from "../layout/AppLayout";
import { formatDateTime } from "../ui/dates";
import {
  orderPriorityBadgeVariants,
  orderPriorityLabels,
  orderStatusBadgeVariants,
  orderStatusLabels,
  statusBadgeClassName
} from "../ui/labels";
import { useDocumentTitle } from "../ui/useDocumentTitle";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Wszystkie" },
  { value: "DRAFT", label: "Przygotowywane" },
  { value: "SAMPLE_COLLECTION_IN_PROGRESS", label: "Trwa pobieranie próbek" },
  { value: "SAMPLE_COLLECTED", label: "Próbki pobrane" },
  { value: "SENT_TO_LAB", label: "Wysłane do laboratorium" },
  { value: "PROCESSING", label: "W trakcie realizacji" },
  { value: "PARTIAL", label: "Wynik częściowy" },
  { value: "COMPLETED", label: "Zakończone" },
  { value: "REJECTED", label: "Odrzucone" },
  { value: "TECHNICAL_ERROR", label: "Błąd techniczny" }
];

export function OrderListPage({ token }: { token: string }) {
  useDocumentTitle("Zlecenia • Klinika Debug");
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<OrdersListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestId = useRef(0);

  const filters = {
    page: Number(searchParams.get("page") ?? "1"),
    pageSize: Number(searchParams.get("pageSize") ?? "20"),
    search: searchParams.get("search") ?? "",
    status: searchParams.get("status") ?? "",
    priority: searchParams.get("priority") ?? "",
    sort: searchParams.get("sort") ?? "updatedAt",
    order: searchParams.get("order") ?? "desc"
  };

  const [searchInput, setSearchInput] = useState(filters.search);

  // Zewnętrzna zmiana filtra (np. „Wyczyść filtry”, przycisk „wstecz”) ma
  // natychmiast odzwierciedlić się w polu tekstowym.
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  // Debounce ~300 ms: aktualizujemy URL (a tym samym wywołujemy request)
  // dopiero po chwili ciszy w pisaniu. Filtry z selectów aktualizują URL od
  // razu — debounce dotyczy wyłącznie tego pola tekstowego.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchParams((current) => {
        const currentSearch = current.get("search") ?? "";
        if (currentSearch === searchInput) {
          return current;
        }
        const next = new URLSearchParams(current);
        if (searchInput) {
          next.set("search", searchInput);
        } else {
          next.delete("search");
        }
        next.set("page", "1");
        return next;
      });
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput, setSearchParams]);

  useEffect(() => {
    const controller = new AbortController();
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setIsLoading(true);
    setError(null);
    setData(null);

    void listOrders(
      token,
      {
        page: filters.page,
        pageSize: filters.pageSize,
        search: filters.search || undefined,
        status: filters.status || undefined,
        priority: filters.priority || undefined,
        sort: filters.sort,
        order: filters.order
      },
      controller.signal
    )
      .then((response) => {
        if (requestId.current === currentRequest) {
          setData(response);
        }
      })
      .catch((caught) => {
        if (requestId.current !== currentRequest || isAbortError(caught)) {
          return;
        }
        setError(toListError(caught));
      })
      .finally(() => {
        if (requestId.current === currentRequest) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    token,
    filters.page,
    filters.pageSize,
    filters.search,
    filters.status,
    filters.priority,
    filters.sort,
    filters.order
  ]);

  function updateFilter(key: string, value: string, resetPage = true) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (resetPage) {
      next.set("page", "1");
    }
    setSearchParams(next);
  }

  function clearFilters() {
    setSearchParams({ page: "1", pageSize: "20", sort: "updatedAt", order: "desc" });
  }

  const hasActiveFilters = Boolean(filters.search || filters.status || filters.priority);

  return (
    <>
      <PageHeader
        title="Zlecenia"
        actions={
          <Link className="button-link" to="/orders/new">
            Nowe zlecenie
          </Link>
        }
      />

      <section className="filters-panel" aria-label="Filtry zleceń">
        <label>
          Wyszukaj
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Identyfikator, pacjent, badanie"
          />
        </label>
        <label>
          Status
          <select
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priorytet
          <select
            value={filters.priority}
            onChange={(event) => updateFilter("priority", event.target.value)}
          >
            <option value="">Wszystkie</option>
            <option value="ROUTINE">Rutynowe</option>
            <option value="URGENT">Pilne</option>
          </select>
        </label>
        <label>
          Sortowanie
          <select
            value={filters.sort}
            onChange={(event) => updateFilter("sort", event.target.value)}
          >
            <option value="updatedAt">Data aktualizacji</option>
            <option value="createdAt">Data utworzenia</option>
            <option value="status">Status</option>
            <option value="priority">Priorytet</option>
            <option value="patientLastName">Nazwisko pacjenta</option>
          </select>
        </label>
        <label>
          Kierunek
          <select
            value={filters.order}
            onChange={(event) => updateFilter("order", event.target.value)}
          >
            <option value="asc">Rosnąco</option>
            <option value="desc">Malejąco</option>
          </select>
        </label>
        <button type="button" className="secondary-button" onClick={clearFilters}>
          Wyczyść filtry
        </button>
      </section>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {isLoading ? <p className="muted">Ładowanie zleceń...</p> : null}

      {!isLoading && data?.items.length === 0 ? (
        <section className="empty-state">
          <h2>Brak zleceń</h2>
          {hasActiveFilters ? (
            <>
              <p>Nie znaleziono zleceń dla bieżących filtrów.</p>
              <button type="button" className="secondary-button" onClick={clearFilters}>
                Wyczyść filtry
              </button>
            </>
          ) : (
            <>
              <p>W tym workspace nie ma jeszcze żadnych zleceń.</p>
              <Link className="button-link" to="/orders/new">
                Nowe zlecenie
              </Link>
            </>
          )}
        </section>
      ) : null}

      {!isLoading && data && data.items.length > 0 ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pacjent</th>
                  <th>Badania</th>
                  <th>Priorytet</th>
                  <th>Status</th>
                  <th>Aktualizacja</th>
                  <th>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            onPageChange={(page) => updateFilter("page", String(page), false)}
          />
        </>
      ) : null}
    </>
  );
}

function isAbortError(caught: unknown) {
  return caught instanceof DOMException && caught.name === "AbortError";
}

function OrderRow({ order }: { order: OrderListItem }) {
  return (
    <tr>
      <td>
        <strong>
          {order.patient.firstName} {order.patient.lastName}
        </strong>
      </td>
      <td>{order.tests.map((test) => test.code).join(", ")}</td>
      <td>
        <span className={statusBadgeClassName(orderPriorityBadgeVariants[order.priority])}>
          {orderPriorityLabels[order.priority]}
        </span>
      </td>
      <td>
        <span className={statusBadgeClassName(orderStatusBadgeVariants[order.status])}>
          {orderStatusLabels[order.status]}
        </span>
      </td>
      <td>{formatDateTime(order.updatedAt)}</td>
      <td>
        <Link to={`/orders/${order.id}`}>Szczegóły</Link>
      </td>
    </tr>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  onPageChange
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav className="pagination" aria-label="Paginacja zleceń">
      <button
        type="button"
        className="secondary-button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Poprzednia
      </button>
      <span>
        Strona {page} z {totalPages || 1}, rekordów: {total}
      </span>
      <button
        type="button"
        className="secondary-button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Następna
      </button>
    </nav>
  );
}

function toListError(caught: unknown) {
  if (caught instanceof ApiClientError) {
    return caught.message;
  }
  return "Nie udało się pobrać listy zleceń.";
}
