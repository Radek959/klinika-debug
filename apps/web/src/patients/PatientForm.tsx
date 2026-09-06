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
            label="Imię"
            value={state.firstName}
            onChange={(value) => update("firstName", value)}
            error={errorsByField.firstName}
            required
          />
          <TextField
            label="Nazwisko"
            value={state.lastName}
            onChange={(value) => update("lastName", value)}
            error={errorsByField.lastName}
            required
          />
          <label>
            Typ identyfikatora
            <select
              value={state.identifierType}
              onChange={(event) =>
                update("identifierType", event.target.value as never)
              }
            >
              <option value="PESEL">{identifierTypeLabels.PESEL}</option>
              <option value="OTHER_DOCUMENT">
                {identifierTypeLabels.OTHER_DOCUMENT}
              </option>
            </select>
            <FieldError messages={errorsByField.identifierType} />
          </label>

          {state.identifierType === "PESEL" ? (
            <TextField
              label="PESEL"
              value={state.pesel}
              onChange={(value) => update("pesel", value)}
              error={errorsByField.pesel}
              required
            />
          ) : (
            <>
              <TextField
                label="Rodzaj dokumentu"
                value={state.documentType}
                onChange={(value) => update("documentType", value)}
                error={errorsByField.documentType}
                required
                maxLength={191}
              />
              <TextField
                label="Numer dokumentu"
                value={state.documentNumber}
                onChange={(value) => update("documentNumber", value)}
                error={errorsByField.documentNumber}
                required
                maxLength={191}
              />
              <TextField
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
            label="Data urodzenia"
            type="date"
            value={state.birthDate}
            onChange={(value) => update("birthDate", value)}
            error={errorsByField.birthDate}
            required
          />
          <label>
            Płeć
            <select
              value={state.gender}
              onChange={(event) => update("gender", event.target.value as never)}
            >
              <option value="FEMALE">{genderLabels.FEMALE}</option>
              <option value="MALE">{genderLabels.MALE}</option>
            </select>
            <FieldError messages={errorsByField.gender} />
          </label>
          <TextField
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
            label="Telefon"
            type="tel"
            value={state.phone}
            onChange={(value) => update("phone", value)}
            error={errorsByField.phone}
          />
          <TextField
            label="E-mail"
            type="email"
            value={state.email}
            onChange={(value) => update("email", value)}
            error={errorsByField.email}
            maxLength={191}
          />
        </div>
        <FieldError messages={errorsByField.contact} />
      </fieldset>

      <fieldset>
        <legend>Adres</legend>
        <div className="form-grid">
          <TextField label="Ulica" value={state.addressStreet} onChange={(value) => update("addressStreet", value)} error={errorsByField.addressStreet} maxLength={191} />
          <TextField label="Numer budynku" value={state.addressBuildingNumber} onChange={(value) => update("addressBuildingNumber", value)} error={errorsByField.addressBuildingNumber} maxLength={191} />
          <TextField label="Numer mieszkania" value={state.addressApartmentNumber} onChange={(value) => update("addressApartmentNumber", value)} error={errorsByField.addressApartmentNumber} maxLength={191} />
          <TextField label="Kod pocztowy" value={state.addressPostalCode} onChange={(value) => update("addressPostalCode", value)} error={errorsByField.addressPostalCode} maxLength={191} />
          <TextField label="Miejscowość" value={state.addressCity} onChange={(value) => update("addressCity", value)} error={errorsByField.addressCity} maxLength={191} />
          <TextField label="Kraj" value={state.addressCountry} onChange={(value) => update("addressCountry", value)} error={errorsByField.addressCountry} maxLength={191} />
        </div>
      </fieldset>

      <fieldset>
        <legend>Opiekun</legend>
        {minor ? (
          <p className="form-hint strong-hint">
            Pacjent jest niepełnoletni. Dane opiekuna są wymagane.
          </p>
        ) : null}
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={guardianEnabled}
            disabled={minor}
            onChange={(event) => update("guardianEnabled", event.target.checked)}
          />
          Pacjent ma opiekuna
        </label>
        {guardianEnabled ? (
          <div className="form-grid">
            <TextField label="Imię opiekuna" value={state.guardianFirstName} onChange={(value) => update("guardianFirstName", value)} error={errorsByField["guardian.firstName"]} />
            <TextField label="Nazwisko opiekuna" value={state.guardianLastName} onChange={(value) => update("guardianLastName", value)} error={errorsByField["guardian.lastName"]} />
            <TextField label="Telefon opiekuna" type="tel" value={state.guardianPhone} onChange={(value) => update("guardianPhone", value)} error={errorsByField["guardian.phone"]} />
            <TextField label="E-mail opiekuna" type="email" value={state.guardianEmail} onChange={(value) => update("guardianEmail", value)} error={errorsByField["guardian.email"]} maxLength={191} />
          </div>
        ) : null}
        <FieldError messages={errorsByField["guardian.contact"] ?? errorsByField.guardian} />
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
  label,
  value,
  onChange,
  error,
  type = "text",
  required = false,
  maxLength
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string[];
  type?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <label>
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        maxLength={maxLength}
      />
      <FieldError messages={error} />
    </label>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) {
    return null;
  }

  return <span className="field-error">{messages.join(" ")}</span>;
}

function groupErrors(errors: ApiFieldError[]) {
  return errors.reduce<Record<string, string[]>>((acc, error) => {
    const label = fieldLabels[error.field] ?? error.field;
    acc[error.field] = acc[error.field] ?? [];
    acc[error.field].push(`${label}: ${error.message}`);
    return acc;
  }, {});
}
