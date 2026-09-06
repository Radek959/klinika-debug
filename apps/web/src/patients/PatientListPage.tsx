import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { PatientListItem, PatientsListResponse } from "@klinika/api-contracts";
import { ApiClientError, listPatients } from "../api/client";
import { PageHeader } from "../layout/AppLayout";
import { formatDateOnly } from "../ui/dates";
import {
  activeLabels,
  formatIdentifier,
  genderLabels,
  identifierTypeLabels
} from "../ui/labels";

export function PatientListPage({ token }: { token: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<PatientsListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestId = useRef(0);

  const filters = {
    page: Number(searchParams.get("page") ?? "1"),
    pageSize: Number(searchParams.get("pageSize") ?? "20"),
    search: searchParams.get("search") ?? "",
    active: searchParams.get("active") ?? "",
    identifierType: searchParams.get("identifierType") ?? "",
    sort: searchParams.get("sort") ?? "lastName",
    order: searchParams.get("order") ?? "asc"
  };

  useEffect(() => {
    const controller = new AbortController();
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setIsLoading(true);
    setError(null);
    setData(null);

    void listPatients(token, {
      page: filters.page,
      pageSize: filters.pageSize,
      search: filters.search,
      active:
        filters.active === "true"
          ? true
          : filters.active === "false"
            ? false
            : undefined,
      identifierType: filters.identifierType || undefined,
      sort: filters.sort,
      order: filters.order
    }, controller.signal)
      .then((response) => {
        if (requestId.current === currentRequest) {
          setData(response);
        }
      })
      .catch((caught) => {
        if (requestId.current !== currentRequest) {
          return;
        }
        if (isAbortError(caught)) {
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
    filters.active,
    filters.identifierType,
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
    setSearchParams({ page: "1", pageSize: "20", sort: "lastName", order: "asc" });
  }

  return (
    <>
      <PageHeader
        title="Pacjenci"
        actions={
          <Link className="button-link" to="/patients/new">
            Dodaj pacjenta
          </Link>
        }
      >
        <p>Lista korzysta z wyszukiwania, filtrów i sortowania po stronie API.</p>
      </PageHeader>

      <section className="filters-panel" aria-label="Filtry pacjentów">
        <label>
          Wyszukaj
          <input
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Imię, nazwisko, PESEL albo dokument"
          />
        </label>
        <label>
          Aktywność
          <select
            value={filters.active}
            onChange={(event) => updateFilter("active", event.target.value)}
          >
            <option value="">Wszyscy</option>
            <option value="true">Aktywni</option>
            <option value="false">Nieaktywni</option>
          </select>
        </label>
        <label>
          Typ identyfikatora
          <select
            value={filters.identifierType}
            onChange={(event) =>
              updateFilter("identifierType", event.target.value)
            }
          >
            <option value="">Wszystkie</option>
            <option value="PESEL">PESEL</option>
            <option value="OTHER_DOCUMENT">Inny dokument</option>
          </select>
        </label>
        <label>
          Sortowanie
          <select
            value={filters.sort}
            onChange={(event) => updateFilter("sort", event.target.value)}
          >
            <option value="lastName">Nazwisko</option>
            <option value="birthDate">Data urodzenia</option>
            <option value="createdAt">Data utworzenia</option>
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

      {isLoading ? <p className="muted">Ładowanie pacjentów...</p> : null}

      {!isLoading && data?.items.length === 0 ? (
        <section className="empty-state">
          <h2>Brak pacjentów</h2>
          <p>Nie znaleziono pacjentów dla bieżących filtrów.</p>
        </section>
      ) : null}

      {!isLoading && data && data.items.length > 0 ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pacjent</th>
                  <th>Identyfikator</th>
                  <th>Data urodzenia</th>
                  <th>Płeć</th>
                  <th>Status</th>
                  <th>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((patient) => (
                  <PatientRow key={patient.id} patient={patient} />
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

function PatientRow({ patient }: { patient: PatientListItem }) {
  return (
    <tr>
      <td>
        <strong>
          {patient.firstName} {patient.lastName}
        </strong>
      </td>
      <td>
        <span>{identifierTypeLabels[patient.identifierType]}: </span>
        {formatIdentifier(patient)}
      </td>
      <td>{formatDateOnly(patient.birthDate)}</td>
      <td>{genderLabels[patient.gender]}</td>
      <td>
        <span className={`status-badge ${patient.active ? "active" : "inactive"}`}>
          {activeLabels[String(patient.active)]}
        </span>
      </td>
      <td>
        <Link to={`/patients/${patient.id}`}>Szczegóły</Link>
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
    <nav className="pagination" aria-label="Paginacja pacjentów">
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
    return caught.correlationId
      ? `${caught.message} Identyfikator błędu: ${caught.correlationId}`
      : caught.message;
  }
  return "Nie udało się pobrać listy pacjentów.";
}
