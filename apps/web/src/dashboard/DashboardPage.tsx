import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { AuthenticatedUser, DashboardSummaryResponse } from "@klinika/api-contracts";
import { ApiClientError, getDashboardSummary } from "../api/client";
import { PageHeader } from "../layout/AppLayout";
import { orderStatusLabels } from "../ui/labels";

export function DashboardPage({
  user,
  token
}: {
  user: AuthenticatedUser;
  token: string;
}) {
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestId = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setIsLoading(true);
    setError(null);

    void getDashboardSummary(token, controller.signal)
      .then((response) => {
        if (requestId.current === currentRequest) {
          setSummary(response);
        }
      })
      .catch((caught) => {
        if (requestId.current !== currentRequest || isAbortError(caught)) {
          return;
        }
        setError(toSummaryError(caught));
      })
      .finally(() => {
        if (requestId.current === currentRequest) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [token]);

  return (
    <>
      <PageHeader title="Panel główny">
        <p>Pracujesz w placówce: {user.workspace.name}.</p>
      </PageHeader>

      {isLoading ? <p>Ładowanie podsumowania...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <h2>Pacjenci</h2>
          <p className="dashboard-number">{summary?.patients.total ?? "—"}</p>
          <p className="muted">pacjentów</p>
          <dl className="dashboard-stat-list">
            <div>
              <dt>Aktywni</dt>
              <dd>{summary?.patients.active ?? "—"}</dd>
            </div>
            <div>
              <dt>Nieaktywni</dt>
              <dd>{summary?.patients.inactive ?? "—"}</dd>
            </div>
          </dl>
          <div className="dashboard-actions">
            <Link className="button-link" to="/patients">
              Pacjenci
            </Link>
            <Link className="secondary-link" to="/patients/new">
              + Dodaj pacjenta
            </Link>
          </div>
        </section>

        <section className="dashboard-card">
          <h2>Zlecenia</h2>
          <p className="dashboard-number">{summary?.orders.total ?? "—"}</p>
          <p className="muted">zleceń</p>
          <dl className="dashboard-stat-list">
            {(Object.keys(orderStatusLabels) as Array<keyof typeof orderStatusLabels>).map(
              (status) => (
                <div key={status}>
                  <dt>{orderStatusLabels[status]}</dt>
                  <dd>{summary?.orders.byStatus[status] ?? "—"}</dd>
                </div>
              )
            )}
          </dl>
          <div className="dashboard-actions">
            <Link className="button-link" to="/orders">
              Zlecenia
            </Link>
            <Link className="secondary-link" to="/orders/new">
              + Nowe zlecenie
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

function isAbortError(caught: unknown) {
  return caught instanceof DOMException && caught.name === "AbortError";
}

function toSummaryError(caught: unknown) {
  if (caught instanceof ApiClientError) {
    return caught.correlationId
      ? `${caught.message} Identyfikator błędu: ${caught.correlationId}`
      : caught.message;
  }
  return "Nie udało się pobrać podsumowania workspace'u.";
}
