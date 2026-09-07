import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import type {
  MedicalTestCatalogItem,
  OrderAdditionalDataValue,
  OrderPriority,
  PatientListItem
} from "@klinika/api-contracts";
import { ApiClientError, listMedicalTests } from "../api/client";
import type { ApiFieldError } from "../api/client";
import { orderPriorityLabels } from "../ui/labels";
import { OrderSummary } from "./OrderSummary";
import { PatientPicker } from "./PatientPicker";
import { TestCatalogSelector } from "./TestCatalogSelector";
import {
  createInitialAdditionalData,
  getMissingRequiredAdditionalFields,
  getSelectedCatalogItems,
  isOrderFormSubmittable,
  type SelectedOrderTests
} from "./orderFormState";

export interface OrderFormState {
  selectedPatient: PatientListItem | null;
  priority: OrderPriority;
  selectedTests: SelectedOrderTests;
}

interface OrderFormProps {
  token: string;
  submitLabel: string;
  submittingLabel: string;
  cancelTo: string;
  initialState?: OrderFormState;
  requireChanges?: boolean;
  hasChanges?: (state: OrderFormState, catalog: MedicalTestCatalogItem[]) => boolean;
  onSubmit: (
    state: OrderFormState,
    catalog: MedicalTestCatalogItem[]
  ) => Promise<void>;
}

export function OrderForm({
  token,
  submitLabel,
  submittingLabel,
  cancelTo,
  initialState,
  requireChanges = false,
  hasChanges,
  onSubmit
}: OrderFormProps) {
  const [catalog, setCatalog] = useState<MedicalTestCatalogItem[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogRetryKey, setCatalogRetryKey] = useState(0);

  const [selectedPatient, setSelectedPatient] = useState<PatientListItem | null>(
    initialState?.selectedPatient ?? null
  );
  const [priority, setPriority] = useState<OrderPriority>(initialState?.priority ?? "ROUTINE");
  const [selectedTests, setSelectedTests] = useState<SelectedOrderTests>(
    initialState?.selectedTests ?? {}
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ApiFieldError[]>([]);
  const [submittedTestIds, setSubmittedTestIds] = useState<string[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialState) {
      return;
    }
    setSelectedPatient(initialState.selectedPatient);
    setPriority(initialState.priority);
    setSelectedTests(initialState.selectedTests);
  }, [initialState]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingCatalog(true);
    setCatalogError(null);

    void listMedicalTests(token, controller.signal)
      .then((response) => setCatalog(response.items.filter((test) => test.active)))
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setCatalogError(formatApiError(caught, "Nie udało się pobrać katalogu badań."));
      })
      .finally(() => setIsLoadingCatalog(false));

    return () => controller.abort();
  }, [token, catalogRetryKey]);

  const selectedCatalogItems = useMemo(
    () => getSelectedCatalogItems(catalog, selectedTests),
    [catalog, selectedTests]
  );
  const missingAdditionalFields = useMemo(
    () => getMissingRequiredAdditionalFields(catalog, selectedTests),
    [catalog, selectedTests]
  );
  const currentState = useMemo(
    () => ({ selectedPatient, priority, selectedTests }),
    [selectedPatient, priority, selectedTests]
  );
  const formHasChanges = hasChanges?.(currentState, catalog) ?? true;
  const canSubmit =
    isOrderFormSubmittable({
      selectedPatient,
      catalog,
      selectedTests,
      isSubmitting
    }) &&
    (!requireChanges || formHasChanges) &&
    !isLoadingCatalog &&
    !catalogError;
  const missingMessages = buildMissingMessages({
    selectedPatient,
    selectedCatalogItems,
    missingAdditionalFields,
    requireChanges,
    formHasChanges
  });
  const patientFieldErrors = fieldErrors.filter((fieldError) => fieldError.field === "patientId");

  function handlePatientChange(patient: PatientListItem | null) {
    setSelectedPatient(patient);
    clearErrors();
  }

  function toggleTest(test: MedicalTestCatalogItem, checked: boolean) {
    setSelectedTests((current) => {
      const next = { ...current };
      if (checked) {
        next[test.id] = { additionalData: createInitialAdditionalData(test) };
      } else {
        delete next[test.id];
      }
      return next;
    });
    clearErrors();
  }

  function updateAdditionalData(
    medicalTestId: string,
    fieldCode: string,
    value: OrderAdditionalDataValue
  ) {
    setSelectedTests((current) => ({
      ...current,
      [medicalTestId]: {
        additionalData: {
          ...current[medicalTestId]?.additionalData,
          [fieldCode]: value
        }
      }
    }));
    clearErrors();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      setGeneralError("Uzupełnij wymagane dane przed zapisaniem zlecenia.");
      return;
    }

    setIsSubmitting(true);
    clearErrors();

    try {
      const submittedIds = selectedCatalogItems.map((test) => test.id);
      setSubmittedTestIds(submittedIds);
      await onSubmit(currentState, catalog);
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setFieldErrors(caught.fieldErrors);
      }
      setGeneralError(formatApiError(caught, "Nie udało się zapisać zlecenia."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function clearErrors() {
    setFieldErrors([]);
    setGeneralError(null);
  }

  return (
    <form className="order-form" onSubmit={submit}>
      {generalError ? (
        <p className="form-error" role="alert">
          {generalError}
        </p>
      ) : null}

      <fieldset>
        <legend>Pacjent i priorytet</legend>
        <div className="order-patient-priority-grid">
          <div>
            <PatientPicker
              token={token}
              selectedPatient={selectedPatient}
              onChange={handlePatientChange}
            />
            {patientFieldErrors.map((fieldError) => (
              <p key={`${fieldError.field}-${fieldError.code}`} className="field-error" role="alert">
                {fieldError.message}
              </p>
            ))}
          </div>
          <label htmlFor="order-priority">
            Priorytet
            <select
              id="order-priority"
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value as OrderPriority);
                clearErrors();
              }}
            >
              <option value="ROUTINE">{orderPriorityLabels.ROUTINE}</option>
              <option value="URGENT">{orderPriorityLabels.URGENT}</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Badania</legend>
        {isLoadingCatalog ? <p className="muted">Ładowanie katalogu badań...</p> : null}
        {catalogError ? (
          <div className="form-error" role="alert">
            <p>{catalogError}</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setCatalogRetryKey((current) => current + 1)}
            >
              Ponów pobieranie katalogu
            </button>
          </div>
        ) : null}
        {!isLoadingCatalog && catalog.length === 0 && !catalogError ? (
          <p className="muted">Brak aktywnych badań w katalogu.</p>
        ) : null}

        <TestCatalogSelector
          catalog={catalog}
          selectedTests={selectedTests}
          fieldErrors={fieldErrors}
          submittedTestIds={submittedTestIds}
          onToggle={toggleTest}
          onFieldChange={updateAdditionalData}
        />
      </fieldset>

      <OrderSummary
        selectedPatient={selectedPatient}
        priority={priority}
        catalog={catalog}
        selectedTests={selectedTests}
      />

      {missingMessages.length > 0 ? (
        <div className="order-form-missing" role="status" aria-live="polite">
          <strong>Do uzupełnienia:</strong>
          <ul>
            {missingMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="form-actions">
        <button type="submit" className="primary-button" disabled={!canSubmit}>
          {isSubmitting ? submittingLabel : submitLabel}
        </button>
        <Link className="secondary-link" to={cancelTo}>
          Anuluj
        </Link>
      </div>
    </form>
  );
}

function buildMissingMessages({
  selectedPatient,
  selectedCatalogItems,
  missingAdditionalFields,
  requireChanges,
  formHasChanges
}: {
  selectedPatient: PatientListItem | null;
  selectedCatalogItems: MedicalTestCatalogItem[];
  missingAdditionalFields: ReturnType<typeof getMissingRequiredAdditionalFields>;
  requireChanges: boolean;
  formHasChanges: boolean;
}) {
  const messages: string[] = [];
  if (!selectedPatient) {
    messages.push("wybierz pacjenta");
  }
  if (selectedCatalogItems.length === 0) {
    messages.push("zaznacz co najmniej jedno badanie");
  }
  missingAdditionalFields.forEach(({ test, field }) => {
    messages.push(`uzupełnij ${field.label} dla badania ${test.name}`);
  });
  if (requireChanges && !formHasChanges) {
    messages.push("wprowadź co najmniej jedną zmianę");
  }
  return messages;
}

function formatApiError(caught: unknown, fallback: string) {
  if (caught instanceof ApiClientError) {
    return caught.correlationId
      ? `${caught.message} Identyfikator błędu: ${caught.correlationId}`
      : caught.message;
  }
  return fallback;
}
