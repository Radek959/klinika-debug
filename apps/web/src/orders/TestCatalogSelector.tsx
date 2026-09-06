import { useMemo } from "react";
import type {
  MedicalTestCatalogItem,
  OrderAdditionalDataValue
} from "@klinika/api-contracts";
import type { ApiFieldError } from "../api/client";
import { materialTypeLabels } from "../ui/labels";
import {
  formatEstimatedDuration,
  type SelectedOrderTests
} from "./orderFormState";

interface TestCatalogSelectorProps {
  catalog: MedicalTestCatalogItem[];
  selectedTests: SelectedOrderTests;
  fieldErrors: ApiFieldError[];
  submittedTestIds: string[];
  onToggle: (test: MedicalTestCatalogItem, checked: boolean) => void;
  onFieldChange: (
    medicalTestId: string,
    fieldCode: string,
    value: OrderAdditionalDataValue
  ) => void;
}

export function TestCatalogSelector({
  catalog,
  selectedTests,
  fieldErrors,
  submittedTestIds,
  onToggle,
  onFieldChange
}: TestCatalogSelectorProps) {
  if (catalog.length === 0) {
    return null;
  }

  return (
    <div className="order-test-catalog">
      {catalog.map((test) => (
        <TestCatalogRow
          key={test.id}
          test={test}
          selected={Boolean(selectedTests[test.id])}
          additionalData={selectedTests[test.id]?.additionalData ?? {}}
          testIndex={submittedTestIds.indexOf(test.id)}
          fieldErrors={fieldErrors}
          onToggle={(checked) => onToggle(test, checked)}
          onFieldChange={(fieldCode, value) => onFieldChange(test.id, fieldCode, value)}
        />
      ))}
    </div>
  );
}

function TestCatalogRow({
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
  onFieldChange: (fieldCode: string, value: OrderAdditionalDataValue) => void;
}) {
  const rowId = `order-test-${test.id}`;
  const rowErrors = useMemo(
    () => getTestLevelErrors(fieldErrors, testIndex),
    [fieldErrors, testIndex]
  );

  return (
    <section className={`order-test-row ${selected ? "is-selected" : ""}`}>
      <div className="order-test-main">
        <label className="order-test-checkbox-row" htmlFor={rowId}>
          <input
            id={rowId}
            className="order-checkbox"
            type="checkbox"
            checked={selected}
            onChange={(event) => onToggle(event.target.checked)}
          />
          <span className="order-test-title">
            <strong>{test.name}</strong>
            <span>{test.code}</span>
          </span>
        </label>
        <dl className="order-test-meta">
          <div>
            <dt>Materiał</dt>
            <dd>{materialTypeLabels[test.materialType]}</dd>
          </div>
          <div>
            <dt>Czas realizacji</dt>
            <dd>{formatEstimatedDuration(test.estimatedDurationMinutes)}</dd>
          </div>
        </dl>
      </div>

      {selected && test.requiredFields.length > 0 ? (
        <div className="order-required-fields" aria-label={`Dane dodatkowe dla badania ${test.name}`}>
          {test.requiredFields
            .slice()
            .sort((left, right) => left.displayOrder - right.displayOrder)
            .map((field) => {
              const fieldId = `${rowId}-field-${field.code}`;
              const errors = getAdditionalFieldErrors(fieldErrors, testIndex, field.code);
              const errorId = `${fieldId}-error`;
              return (
                <div className="order-required-field" key={field.code}>
                  {field.valueType === "BOOLEAN" ? (
                    <label className="order-additional-checkbox" htmlFor={fieldId}>
                      <input
                        id={fieldId}
                        className="order-checkbox"
                        type="checkbox"
                        checked={Boolean(additionalData[field.code] ?? false)}
                        onChange={(event) => onFieldChange(field.code, event.target.checked)}
                        aria-invalid={errors.length > 0 ? true : undefined}
                        aria-describedby={errors.length > 0 ? errorId : undefined}
                      />
                      {field.label}
                    </label>
                  ) : (
                    <label htmlFor={fieldId}>
                      {field.label}
                      <input
                        id={fieldId}
                        value={String(additionalData[field.code] ?? "")}
                        onChange={(event) => onFieldChange(field.code, event.target.value)}
                        aria-invalid={errors.length > 0 ? true : undefined}
                        aria-describedby={errors.length > 0 ? errorId : undefined}
                      />
                    </label>
                  )}
                  <FieldError id={errorId} messages={errors} />
                </div>
              );
            })}
        </div>
      ) : null}

      <FieldError messages={rowErrors} />
    </section>
  );
}

function getAdditionalFieldErrors(
  fieldErrors: ApiFieldError[],
  testIndex: number,
  fieldCode: string
) {
  if (testIndex < 0) {
    return [];
  }

  const exactField = `tests.${testIndex}.additionalData.${fieldCode}`;
  return fieldErrors
    .filter((fieldError) => fieldError.field === exactField)
    .map((fieldError) => fieldError.message);
}

function getTestLevelErrors(fieldErrors: ApiFieldError[], testIndex: number) {
  if (testIndex < 0) {
    return [];
  }

  const testPrefix = `tests.${testIndex}.`;
  const additionalPrefix = `tests.${testIndex}.additionalData.`;
  return fieldErrors
    .filter(
      (fieldError) =>
        fieldError.field.startsWith(testPrefix) &&
        !fieldError.field.startsWith(additionalPrefix)
    )
    .map((fieldError) => fieldError.message);
}

function FieldError({ id, messages }: { id?: string; messages: string[] }) {
  if (!messages.length) {
    return null;
  }

  return (
    <p id={id} className="field-error" role="alert">
      {messages.join(" ")}
    </p>
  );
}
