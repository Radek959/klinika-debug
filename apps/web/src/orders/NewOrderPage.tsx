import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  MedicalTestCatalogItem,
  OrderAdditionalDataValue,
  OrderPriority
} from "@klinika/api-contracts";
import type { ApiFieldError } from "../api/client";
import { ApiClientError, createOrder, listMedicalTests } from "../api/client";
import { PageHeader } from "../layout/AppLayout";
import { materialTypeLabels } from "../ui/labels";

interface SelectedTest {
  additionalData: Record<string, OrderAdditionalDataValue>;
}

export function NewOrderPage({ token }: { token: string }) {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<MedicalTestCatalogItem[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [patientId, setPatientId] = useState("");
  const [priority, setPriority] = useState<OrderPriority>("ROUTINE");
  const [selectedTests, setSelectedTests] = useState<Record<string, SelectedTest>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ApiFieldError[]>([]);
  const [submittedTestIds, setSubmittedTestIds] = useState<string[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);

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
        setCatalogError(
          caught instanceof ApiClientError
            ? caught.message
            : "Nie udało się pobrać katalogu badań."
        );
      })
      .finally(() => setIsLoadingCatalog(false));

    return () => controller.abort();
  }, [token]);

  function toggleTest(test: MedicalTestCatalogItem, checked: boolean) {
    setSelectedTests((current) => {
      const next = { ...current };
      if (checked) {
        next[test.id] = { additionalData: {} };
      } else {
        delete next[test.id];
      }
      return next;
    });
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
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFieldErrors([]);
    setGeneralError(null);

    try {
      const tests = Object.entries(selectedTests).map(([medicalTestId, selection]) => ({
        medicalTestId,
        additionalData:
          Object.keys(selection.additionalData).length > 0
            ? selection.additionalData
            : undefined
      }));
      setSubmittedTestIds(tests.map((test) => test.medicalTestId));
      const order = await createOrder(token, {
        patientId,
        priority,
        tests
      });
      navigate(`/orders/${order.id}`, {
        state: { message: "Zlecenie zostało utworzone." }
      });
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setFieldErrors(caught.fieldErrors);
        setGeneralError(caught.message);
      } else {
        setGeneralError("Nie udało się utworzyć zlecenia.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Nowe zlecenie"
        actions={
          <Link className="secondary-link" to="/orders">
            Wróć do listy
          </Link>
        }
      />

      <form className="patient-form" onSubmit={submit}>
        {generalError ? (
          <p className="form-error" role="alert">
            {generalError}
          </p>
        ) : null}

        <fieldset>
          <legend>Pacjent i priorytet</legend>
          <div className="form-grid">
            <label>
              Identyfikator pacjenta
              <input
                value={patientId}
                onChange={(event) => setPatientId(event.target.value)}
                required
              />
            </label>
            <label>
              Priorytet
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as OrderPriority)}
              >
                <option value="ROUTINE">Rutynowe</option>
                <option value="URGENT">Pilne</option>
              </select>
            </label>
          </div>
          <p className="muted">
            Identyfikator pacjenta znajdziesz na stronie{" "}
            <Link to="/patients">szczegółów pacjenta</Link>.
          </p>
        </fieldset>

        <fieldset>
          <legend>Badania</legend>
          {isLoadingCatalog ? <p className="muted">Ładowanie katalogu badań...</p> : null}
          {catalogError ? (
            <p className="form-error" role="alert">
              {catalogError}
            </p>
          ) : null}
          {!isLoadingCatalog && catalog.length === 0 && !catalogError ? (
            <p className="muted">Brak aktywnych badań w katalogu.</p>
          ) : null}

          <div className="test-catalog-list">
            {catalog.map((test) => (
              <TestCatalogItem
                key={test.id}
                test={test}
                selected={Boolean(selectedTests[test.id])}
                additionalData={selectedTests[test.id]?.additionalData ?? {}}
                testIndex={submittedTestIds.indexOf(test.id)}
                fieldErrors={fieldErrors}
                onToggle={(checked) => toggleTest(test, checked)}
                onFieldChange={(code, value) => updateAdditionalData(test.id, code, value)}
              />
            ))}
          </div>
        </fieldset>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? "Zapisywanie..." : "Utwórz zlecenie"}
          </button>
        </div>
      </form>
    </>
  );
}

function TestCatalogItem({
  test,
  selected,
  additionalData,
  testIndex,
  fieldErrors,
  onToggle,
  onFieldChange
}: {
  test: MedicalTestCatalogItem;
  selected: boolean;
  additionalData: Record<string, OrderAdditionalDataValue>;
  testIndex: number;
  fieldErrors: ApiFieldError[];
  onToggle: (checked: boolean) => void;
  onFieldChange: (code: string, value: OrderAdditionalDataValue) => void;
}) {
  return (
    <div className="test-catalog-item">
      <label>
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <strong>{test.name}</strong> ({test.code}) — {materialTypeLabels[test.materialType]}
      </label>

      {selected && test.requiredFields.length > 0 ? (
        <div className="test-required-fields">
          {test.requiredFields.map((field) => (
            <label key={field.code}>
              {field.label}
              {field.valueType === "BOOLEAN" ? (
                <input
                  type="checkbox"
                  checked={Boolean(additionalData[field.code] ?? false)}
                  onChange={(event) => onFieldChange(field.code, event.target.checked)}
                />
              ) : (
                <input
                  value={String(additionalData[field.code] ?? "")}
                  onChange={(event) => onFieldChange(field.code, event.target.value)}
                />
              )}
            </label>
          ))}
        </div>
      ) : null}

      {fieldErrors
        .filter((fieldError) => testIndex >= 0 && fieldError.field.startsWith(`tests.${testIndex}.`))
        .map((fieldError) => (
          <p key={fieldError.code} className="form-error" role="alert">
            {fieldError.message}
          </p>
        ))}
    </div>
  );
}
