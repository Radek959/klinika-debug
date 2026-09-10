import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import type { PatientResponse } from "@klinika/api-contracts";
import { ApiClientError, getPatient, updatePatient } from "../api/client";
import { PageHeader } from "../layout/AppLayout";
import { formatDateOnly, formatDateTime } from "../ui/dates";
import {
  activeLabels,
  formatIdentifier,
  genderLabels,
  identifierTypeLabels
} from "../ui/labels";
import { useDocumentTitle } from "../ui/useDocumentTitle";

interface LoadError {
  title: string;
  message: string;
}

export function PatientDetailsPage({ token }: { token: string }) {
  const { patientId } = useParams();
  const location = useLocation();
  const [patient, setPatient] = useState<PatientResponse | null>(null);
  useDocumentTitle(
    patient ? `${patient.firstName} ${patient.lastName} • Klinika Debug` : "Pacjenci • Klinika Debug"
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [error, setError] = useState<LoadError | null>(null);
  const requestId = useRef(0);
  const [success, setSuccess] = useState<string | null>(
    (location.state as { message?: string } | null)?.message ?? null
  );

  useEffect(() => {
    if (!patientId) {
      return;
    }

    const controller = new AbortController();
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setIsLoading(true);
    setError(null);
    setPatient(null);
    void getPatient(token, patientId, controller.signal)
      .then((response) => {
        if (requestId.current === currentRequest) {
          setPatient(response);
        }
      })
      .catch((caught) => {
        if (requestId.current === currentRequest && !isAbortError(caught)) {
          setError(toLoadError(caught));
        }
      })
      .finally(() => {
        if (requestId.current === currentRequest) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [patientId, token]);

  async function deactivate() {
    if (!patientId || !patient) {
      return;
    }
    const confirmed = window.confirm(
      "Czy na pewno oznaczyć pacjenta jako nieaktywnego?"
    );
    if (!confirmed) {
      return;
    }

    setIsDeactivating(true);
    setError(null);
    try {
      const updated = await updatePatient(token, patientId, { active: false });
      setPatient(updated);
      setSuccess("Pacjent został oznaczony jako nieaktywny.");
    } catch (caught) {
      setError({
        title: "Nie udało się zapisać danych pacjenta",
        message: toApiMessage(caught)
      });
    } finally {
      setIsDeactivating(false);
    }
  }

  if (isLoading) {
    return <p className="muted">Ładowanie danych pacjenta...</p>;
  }

  if (error && !patient) {
    return (
      <section className="empty-state" role="alert">
        <h1>{error.title}</h1>
        <p>{error.message}</p>
        <Link to="/patients">Wróć do listy</Link>
      </section>
    );
  }

  if (!patient) {
    return null;
  }

  return (
    <>
      <PageHeader
        title={`${patient.firstName} ${patient.lastName}`}
        actions={
          <>
            <Link className="secondary-link" to="/patients">
              Wróć do listy
            </Link>
            <Link className="secondary-link" to={`/patients/${patient.id}/edit`}>
              Edytuj dane
            </Link>
            <Link className="button-link" to={`/orders/new?patientId=${patient.id}`}>
              Utwórz zlecenie
            </Link>
          </>
        }
      />

      {success ? (
        <p className="form-success" role="status" aria-live="polite">
          {success}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error.message}
        </p>
      ) : null}

      <section className="details-grid">
        <DataSection title="Dane podstawowe">
          <DataRow label="Typ identyfikatora" value={identifierTypeLabels[patient.identifierType]} />
          <DataRow label="Identyfikator" value={formatIdentifier(patient)} />
          <DataRow label="Data urodzenia" value={formatDateOnly(patient.birthDate)} />
          <DataRow label="Płeć" value={genderLabels[patient.gender]} />
          <DataRow label="Obywatelstwo" value={patient.citizenship ?? "Nie podano"} />
          <DataRow label="Status" value={activeLabels[String(patient.active)]} />
        </DataSection>

        <DataSection title="Kontakt">
          <DataRow label="Telefon" value={patient.phone ?? "Nie podano"} />
          <DataRow label="E-mail" value={patient.email ?? "Nie podano"} />
        </DataSection>

        <DataSection title="Adres">
          <DataRow label="Ulica" value={patient.addressStreet ?? "Nie podano"} />
          <DataRow label="Numer budynku" value={patient.addressBuildingNumber ?? "Nie podano"} />
          <DataRow label="Numer mieszkania" value={patient.addressApartmentNumber ?? "Nie podano"} />
          <DataRow label="Kod pocztowy" value={patient.addressPostalCode ?? "Nie podano"} />
          <DataRow label="Miejscowość" value={patient.addressCity ?? "Nie podano"} />
          <DataRow label="Kraj" value={patient.addressCountry ?? "Nie podano"} />
        </DataSection>

        <DataSection title="Opiekun" asList={Boolean(patient.guardian)}>
          {patient.guardian ? (
            <>
              <DataRow label="Imię" value={patient.guardian.firstName} />
              <DataRow label="Nazwisko" value={patient.guardian.lastName} />
              <DataRow label="Telefon" value={patient.guardian.phone ?? "Nie podano"} />
              <DataRow label="E-mail" value={patient.guardian.email ?? "Nie podano"} />
            </>
          ) : (
            <p className="muted">Brak opiekuna.</p>
          )}
        </DataSection>

        <DataSection title="Historia rekordu">
          <DataRow label="Utworzono" value={formatDateTime(patient.createdAt)} />
          <DataRow label="Ostatnia modyfikacja" value={formatDateTime(patient.updatedAt)} />
        </DataSection>
      </section>

      {patient.active ? (
        <div className="danger-actions">
          <button
            type="button"
            className="danger-button"
            disabled={isDeactivating}
            onClick={deactivate}
          >
            {isDeactivating ? "Oznaczanie..." : "Oznacz jako nieaktywnego"}
          </button>
        </div>
      ) : null}
    </>
  );
}

function DataSection({
  title,
  children,
  asList = true
}: {
  title: string;
  children: ReactNode;
  asList?: boolean;
}) {
  return (
    <section className="data-section">
      <h2>{title}</h2>
      {asList ? <dl className="data-list">{children}</dl> : children}
    </section>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="data-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function toLoadError(caught: unknown): LoadError {
  if (
    caught instanceof ApiClientError &&
    (caught.code === "PATIENT_NOT_FOUND" || caught.status === 404)
  ) {
    return {
      title: "Nie znaleziono pacjenta",
      message: "Nie znaleziono pacjenta."
    };
  }

  if (
    !(caught instanceof ApiClientError) ||
    caught.status === 0 ||
    caught.status >= 500
  ) {
    return {
      title: "Nie udało się pobrać danych pacjenta",
      message: toApiMessage(caught)
    };
  }

  return {
    title: "Nie udało się pobrać danych pacjenta",
    message: toApiMessage(caught)
  };
}

function toApiMessage(caught: unknown) {
  if (caught instanceof ApiClientError) {
    return caught.correlationId
      ? `${caught.message} Identyfikator błędu: ${caught.correlationId}`
      : caught.message;
  }
  return "Nie udało się pobrać danych pacjenta.";
}

function isAbortError(caught: unknown) {
  return caught instanceof DOMException && caught.name === "AbortError";
}
