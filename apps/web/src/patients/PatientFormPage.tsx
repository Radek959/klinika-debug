import { useEffect, useMemo, useRef, useState } from "react";
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
  const [generalError, setGeneralError] = useState<FormLoadError | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!patientId) {
      return;
    }

    const controller = new AbortController();
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setIsLoading(true);
    setGeneralError(null);
    setInitialState(null);
    setState(null);
    void getPatient(token, patientId, controller.signal)
      .then((patient) => {
        if (requestId.current === currentRequest) {
          const formState = patientToFormState(patient);
          setInitialState(formState);
          setState(formState);
        }
      })
      .catch((caught) => {
        if (requestId.current === currentRequest && !isAbortError(caught)) {
          setGeneralError(toLoadError(caught));
        }
      })
      .finally(() => {
        if (requestId.current === currentRequest) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
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
      handleFormError(caught, setFieldErrors, (error) => {
        setGeneralError(error ? { title: "Nie udało się zapisać pacjenta", message: error } : null);
      });
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
        <h1>{generalError?.title ?? "Nie udało się pobrać danych pacjenta"}</h1>
        <p>{generalError?.message ?? "Nie udało się pobrać danych pacjenta."}</p>
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
        generalError={generalError?.message}
        isDirty={isDirty}
      />
    </>
  );
}

interface FormLoadError {
  title: string;
  message: string;
}

function toLoadError(caught: unknown): FormLoadError {
  if (
    caught instanceof ApiClientError &&
    (caught.code === "PATIENT_NOT_FOUND" || caught.status === 404)
  ) {
    return {
      title: "Nie znaleziono pacjenta",
      message: "Nie znaleziono pacjenta."
    };
  }

  return {
    title: "Nie udało się pobrać danych pacjenta",
    message: toGeneralError(caught)
  };
}

function isAbortError(caught: unknown) {
  return caught instanceof DOMException && caught.name === "AbortError";
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
