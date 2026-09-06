import type { FormEvent } from "react";
import { useMemo } from "react";
import type { ApiFieldError } from "../api/client";
import { genderLabels, identifierTypeLabels } from "../ui/labels";
import {
  type PatientFormState,
  isMinorPatient
} from "./patientFormState";

interface PatientFormProps {
  state: PatientFormState;
  onChange: (state: PatientFormState) => void;
  onSubmit: () => void;
  submitLabel: string;
  isSubmitting: boolean;
  fieldErrors?: ApiFieldError[];
  generalError?: string | null;
  successMessage?: string | null;
  isDirty?: boolean;
}

const fieldLabels: Record<string, string> = {
  firstName: "Imię",
  lastName: "Nazwisko",
  identifierType: "Typ identyfikatora",
  pesel: "PESEL",
  documentType: "Rodzaj dokumentu",
  documentNumber: "Numer dokumentu",
  documentCountry: "Kraj wydania",
  birthDate: "Data urodzenia",
  gender: "Płeć",
  citizenship: "Obywatelstwo",
  phone: "Telefon",
  email: "E-mail",
  contact: "Kontakt",
  addressStreet: "Ulica",
  addressBuildingNumber: "Numer budynku",
  addressApartmentNumber: "Numer mieszkania",
  addressPostalCode: "Kod pocztowy",
  addressCity: "Miejscowość",
  addressCountry: "Kraj",
  "guardian.firstName": "Imię opiekuna",
  "guardian.lastName": "Nazwisko opiekuna",
  "guardian.phone": "Telefon opiekuna",
  "guardian.email": "E-mail opiekuna",
  "guardian.contact": "Kontakt do opiekuna",
  guardian: "Opiekun"
};

export function PatientForm({
  state,
  onChange,
  onSubmit,
  submitLabel,
  isSubmitting,
  fieldErrors = [],
  generalError,
  successMessage,
  isDirty = true
}: PatientFormProps) {
  const errorsByField = useMemo(() => groupErrors(fieldErrors), [fieldErrors]);
  const minor = isMinorPatient(state);
  const guardianEnabled = minor || state.guardianEnabled;

  function update<K extends keyof PatientFormState>(
    key: K,
    value: PatientFormState[K]
  ) {
    onChange({ ...state, [key]: value });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="patient-form" onSubmit={submit}>
      {generalError ? (
        <p className="form-error" role="alert">
          {generalError}
        </p>
      ) : null}
      {successMessage ? (
        <p className="form-success" role="status" aria-live="polite">
          {successMessage}
        </p>
      ) : null}

      <fieldset>
        <legend>Dane podstawowe</legend>
        <div className="form-grid">
          <TextField
            id="patient-first-name"
            label="Imię"
            value={state.firstName}
            onChange={(value) => update("firstName", value)}
            error={errorsByField.firstName}
            required
          />
          <TextField
            id="patient-last-name"
            label="Nazwisko"
            value={state.lastName}
            onChange={(value) => update("lastName", value)}
            error={errorsByField.lastName}
            required
          />
          <label htmlFor="patient-identifier-type">
            Typ identyfikatora
            <select
              id="patient-identifier-type"
              value={state.identifierType}
              onChange={(event) =>
                update("identifierType", event.target.value as never)
              }
              aria-invalid={hasError(errorsByField.identifierType)}
              aria-describedby={describedBy(
                "patient-identifier-type",
                errorsByField.identifierType
              )}
            >
              <option value="PESEL">{identifierTypeLabels.PESEL}</option>
              <option value="OTHER_DOCUMENT">
                {identifierTypeLabels.OTHER_DOCUMENT}
              </option>
            </select>
            <FieldError
              id={errorId("patient-identifier-type")}
              messages={errorsByField.identifierType}
            />
          </label>

          {state.identifierType === "PESEL" ? (
            <TextField
              id="patient-pesel"
              label="PESEL"
              value={state.pesel}
              onChange={(value) => update("pesel", value)}
              error={errorsByField.pesel}
              required
            />
          ) : (
            <>
              <TextField
                id="patient-document-type"
                label="Rodzaj dokumentu"
                value={state.documentType}
                onChange={(value) => update("documentType", value)}
                error={errorsByField.documentType}
                required
                maxLength={191}
              />
              <TextField
                id="patient-document-number"
                label="Numer dokumentu"
                value={state.documentNumber}
                onChange={(value) => update("documentNumber", value)}
                error={errorsByField.documentNumber}
                required
                maxLength={191}
              />
              <TextField
                id="patient-document-country"
                label="Kraj wydania"
                value={state.documentCountry}
                onChange={(value) => update("documentCountry", value)}
                error={errorsByField.documentCountry}
                required
                maxLength={191}
              />
            </>
          )}

          <TextField
            id="patient-birth-date"
            label="Data urodzenia"
            type="date"
            value={state.birthDate}
            onChange={(value) => update("birthDate", value)}
            error={errorsByField.birthDate}
            required
          />
          <label htmlFor="patient-gender">
            Płeć
            <select
              id="patient-gender"
              value={state.gender}
              onChange={(event) => update("gender", event.target.value as never)}
              aria-invalid={hasError(errorsByField.gender)}
              aria-describedby={describedBy("patient-gender", errorsByField.gender)}
            >
              <option value="FEMALE">{genderLabels.FEMALE}</option>
              <option value="MALE">{genderLabels.MALE}</option>
            </select>
            <FieldError id={errorId("patient-gender")} messages={errorsByField.gender} />
          </label>
          <TextField
            id="patient-citizenship"
            label="Obywatelstwo"
            value={state.citizenship}
            onChange={(value) => update("citizenship", value)}
            error={errorsByField.citizenship}
            maxLength={191}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>Kontakt</legend>
        <p className="form-hint">Wymagany jest przynajmniej jeden sposób kontaktu.</p>
        <div className="form-grid">
          <TextField
            id="patient-phone"
            label="Telefon"
            type="tel"
            value={state.phone}
            onChange={(value) => update("phone", value)}
            error={errorsByField.phone}
          />
          <TextField
            id="patient-email"
            label="E-mail"
            type="email"
            value={state.email}
            onChange={(value) => update("email", value)}
            error={errorsByField.email}
            maxLength={191}
          />
        </div>
        <FieldError id={errorId("patient-contact")} messages={errorsByField.contact} />
      </fieldset>

      <fieldset>
        <legend>Adres</legend>
        <div className="form-grid">
          <TextField id="patient-address-street" label="Ulica" value={state.addressStreet} onChange={(value) => update("addressStreet", value)} error={errorsByField.addressStreet} maxLength={191} />
          <TextField id="patient-address-building-number" label="Numer budynku" value={state.addressBuildingNumber} onChange={(value) => update("addressBuildingNumber", value)} error={errorsByField.addressBuildingNumber} maxLength={191} />
          <TextField id="patient-address-apartment-number" label="Numer mieszkania" value={state.addressApartmentNumber} onChange={(value) => update("addressApartmentNumber", value)} error={errorsByField.addressApartmentNumber} maxLength={191} />
          <TextField id="patient-address-postal-code" label="Kod pocztowy" value={state.addressPostalCode} onChange={(value) => update("addressPostalCode", value)} error={errorsByField.addressPostalCode} maxLength={191} />
          <TextField id="patient-address-city" label="Miejscowość" value={state.addressCity} onChange={(value) => update("addressCity", value)} error={errorsByField.addressCity} maxLength={191} />
          <TextField id="patient-address-country" label="Kraj" value={state.addressCountry} onChange={(value) => update("addressCountry", value)} error={errorsByField.addressCountry} maxLength={191} />
        </div>
      </fieldset>

      <fieldset>
        <legend>Opiekun</legend>
        {minor ? (
          <p className="form-hint strong-hint">
            Pacjent jest niepełnoletni. Dane opiekuna są wymagane.
          </p>
        ) : null}
        <label className="checkbox-row" htmlFor="patient-guardian-enabled">
          <input
            id="patient-guardian-enabled"
            type="checkbox"
            checked={guardianEnabled}
            disabled={minor}
            onChange={(event) => update("guardianEnabled", event.target.checked)}
            aria-invalid={hasError(errorsByField.guardian)}
            aria-describedby={describedBy(
              "patient-guardian-enabled",
              errorsByField.guardian
            )}
          />
          Pacjent ma opiekuna
        </label>
        {guardianEnabled ? (
          <div className="form-grid">
            <TextField id="patient-guardian-first-name" label="Imię opiekuna" value={state.guardianFirstName} onChange={(value) => update("guardianFirstName", value)} error={errorsByField["guardian.firstName"]} />
            <TextField id="patient-guardian-last-name" label="Nazwisko opiekuna" value={state.guardianLastName} onChange={(value) => update("guardianLastName", value)} error={errorsByField["guardian.lastName"]} />
            <TextField id="patient-guardian-phone" label="Telefon opiekuna" type="tel" value={state.guardianPhone} onChange={(value) => update("guardianPhone", value)} error={errorsByField["guardian.phone"]} />
            <TextField id="patient-guardian-email" label="E-mail opiekuna" type="email" value={state.guardianEmail} onChange={(value) => update("guardianEmail", value)} error={errorsByField["guardian.email"]} maxLength={191} />
          </div>
        ) : null}
        <FieldError
          id={errorId("patient-guardian-contact")}
          messages={errorsByField["guardian.contact"] ?? errorsByField.guardian}
        />
      </fieldset>

      <div className="form-actions">
        {!isDirty ? (
          <span className="muted" role="status">
            Nie wprowadzono zmian
          </span>
        ) : null}
        <button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Zapisywanie..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  required = false,
  maxLength
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string[];
  type?: string;
  required?: boolean;
  maxLength?: number;
}) {
  const fieldErrorId = errorId(id);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        maxLength={maxLength}
        aria-invalid={hasError(error)}
        aria-describedby={describedBy(id, error)}
      />
      <FieldError id={fieldErrorId} messages={error} />
    </div>
  );
}

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) {
    return null;
  }

  return (
    <span className="field-error" id={id}>
      {messages.join(" ")}
    </span>
  );
}

function groupErrors(errors: ApiFieldError[]) {
  return errors.reduce<Record<string, string[]>>((acc, error) => {
    const label = fieldLabels[error.field] ?? error.field;
    acc[error.field] = acc[error.field] ?? [];
    acc[error.field].push(`${label}: ${error.message}`);
    return acc;
  }, {});
}

function hasError(messages?: string[]) {
  return messages?.length ? true : undefined;
}

function describedBy(id: string, messages?: string[]) {
  return messages?.length ? errorId(id) : undefined;
}

function errorId(id: string) {
  return `${id}-error`;
}
