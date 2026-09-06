import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ApiFieldError } from "../api/client";
import {
  ApiClientError,
  createPatient,
  getPatient,
  updatePatient
} from "../api/client";
import { PageHeader } from "../layout/AppLayout";
import { PatientForm } from "./PatientForm";
import {
  emptyPatientForm,
  hasPatientChanges,
  patientToFormState,
  toCreatePatientPayload,
  toUpdatePatientPayload,
  type PatientFormState
} from "./patientFormState";

export function NewPatientPage({ token }: { token: string }) {
  const navigate = useNavigate();
  const [state, setState] = useState<PatientFormState>(emptyPatientForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ApiFieldError[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);

  async function submit() {
    setIsSubmitting(true);
    setFieldErrors([]);
    setGeneralError(null);

    try {
      const patient = await createPatient(token, toCreatePatientPayload(state));
      navigate(`/patients/${patient.id}`, {
        state: { message: "Pacjent został utworzony." }
      });
    } catch (caught) {
      handleFormError(caught, setFieldErrors, setGeneralError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Dodaj pacjenta"
        actions={
          <Link className="secondary-link" to="/patients">
            Wróć do listy
          </Link>
        }
      />
      <PatientForm
        state={state}
        onChange={setState}
        onSubmit={submit}
        submitLabel="Utwórz pacjenta"
        isSubmitting={isSubmitting}
        fieldErrors={fieldErrors}
        generalError={generalError}
      />
    </>
  );
}

export function EditPatientPage({ token }: { token: string }) {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [initialState, setInitialState] = useState<PatientFormState | null>(null);
  const [state, setState] = useState<PatientFormState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ApiFieldError[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) {
      return;
    }

    setIsLoading(true);
    setGeneralError(null);
    void getPatient(token, patientId)
      .then((patient) => {
        const formState = patientToFormState(patient);
        setInitialState(formState);
        setState(formState);
      })
      .catch((caught) => {
        if (caught instanceof ApiClientError && caught.code === "PATIENT_NOT_FOUND") {
          setGeneralError("Nie znaleziono pacjenta.");
        } else {
          setGeneralError(toGeneralError(caught));
        }
      })
      .finally(() => setIsLoading(false));
  }, [patientId, token]);

  const isDirty = useMemo(() => {
    return state && initialState ? hasPatientChanges(state, initialState) : false;
  }, [state, initialState]);

  async function submit() {
    if (!patientId || !state || !initialState || !isDirty) {
      return;
    }

    setIsSubmitting(true);
    setFieldErrors([]);
    setGeneralError(null);

    try {
      await updatePatient(token, patientId, toUpdatePatientPayload(state, initialState));
      navigate(`/patients/${patientId}`, {
        state: { message: "Dane pacjenta zostały zapisane." }
      });
    } catch (caught) {
      handleFormError(caught, setFieldErrors, setGeneralError);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <p className="muted">Ładowanie formularza pacjenta...</p>;
  }

  if (!state || !initialState) {
    return (
      <section className="empty-state" role="alert">
        <h1>Nie znaleziono pacjenta</h1>
        <p>{generalError ?? "Nie udało się pobrać danych pacjenta."}</p>
        <Link to="/patients">Wróć do listy</Link>
      </section>
    );
  }

  return (
    <>
      <PageHeader
        title="Edytuj pacjenta"
        actions={
          <Link className="secondary-link" to={`/patients/${patientId}`}>
            Wróć do szczegółów
          </Link>
        }
      />
      <PatientForm
        state={state}
        onChange={setState}
        onSubmit={submit}
        submitLabel="Zapisz zmiany"
        isSubmitting={isSubmitting}
        fieldErrors={fieldErrors}
        generalError={generalError}
        isDirty={isDirty}
      />
    </>
  );
}

function handleFormError(
  caught: unknown,
  setFieldErrors: (errors: ApiFieldError[]) => void,
  setGeneralError: (error: string | null) => void
) {
  if (caught instanceof ApiClientError) {
    setFieldErrors(caught.fieldErrors);
    setGeneralError(toGeneralError(caught));
    return;
  }

  setGeneralError("Nie udało się zapisać pacjenta.");
}

function toGeneralError(caught: unknown) {
  if (caught instanceof ApiClientError) {
    const duplicateMessage =
      caught.code === "DUPLICATE_PESEL"
        ? "W tej placówce istnieje już pacjent z tym numerem PESEL."
        : caught.code === "DUPLICATE_DOCUMENT"
          ? "W tej placówce istnieje już pacjent z tym dokumentem."
          : caught.message;
    return caught.correlationId
      ? `${duplicateMessage} Identyfikator błędu: ${caught.correlationId}`
      : duplicateMessage;
  }
  return "Nie udało się wykonać operacji.";
}
