import { useEffect, useState } from "react";
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

export function PatientDetailsPage({ token }: { token: string }) {
  const { patientId } = useParams();
  const location = useLocation();
  const [patient, setPatient] = useState<PatientResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(
    (location.state as { message?: string } | null)?.message ?? null
  );

  useEffect(() => {
    if (!patientId) {
      return;
    }

    setIsLoading(true);
    setError(null);
    void getPatient(token, patientId)
      .then(setPatient)
      .catch((caught) => {
        if (caught instanceof ApiClientError && caught.code === "PATIENT_NOT_FOUND") {
          setError("Nie znaleziono pacjenta.");
        } else {
          setError(toDetailsError(caught));
        }
      })
      .finally(() => setIsLoading(false));
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
      setError(toDetailsError(caught));
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
        <h1>Nie znaleziono pacjenta</h1>
        <p>{error}</p>
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
            <Link className="button-link" to={`/patients/${patient.id}/edit`}>
              Edytuj dane
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
          {error}
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

        <DataSection title="Opiekun">
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
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="data-section">
      <h2>{title}</h2>
      <dl className="data-list">{children}</dl>
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

function toDetailsError(caught: unknown) {
  if (caught instanceof ApiClientError) {
    return caught.correlationId
      ? `${caught.message} Identyfikator błędu: ${caught.correlationId}`
      : caught.message;
  }
  return "Nie udało się pobrać danych pacjenta.";
}
