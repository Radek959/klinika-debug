import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import type { PatientListItem } from "@klinika/api-contracts";
import { ApiClientError, listPatients } from "../api/client";
import { formatDateOnly } from "../ui/dates";
import { maskPatientIdentifier, patientDisplayName } from "./orderFormState";

const PATIENT_SEARCH_PAGE_SIZE = 10;
const PATIENT_SEARCH_DEBOUNCE_MS = 300;

interface PatientPickerProps {
  token: string;
  selectedPatient: PatientListItem | null;
  onChange: (patient: PatientListItem | null) => void;
}

export function PatientPicker({ token, selectedPatient, onChange }: PatientPickerProps) {
  const reactId = useId();
  const inputId = `${reactId}-patient-input`;
  const listboxId = `${reactId}-patient-listbox`;
  const statusId = `${reactId}-patient-status`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestId = useRef(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientListItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!isOpen || selectedPatient) {
      return undefined;
    }

    const controller = new AbortController();
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    const timeout = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);

      void listPatients(
        token,
        {
          page: 1,
          pageSize: PATIENT_SEARCH_PAGE_SIZE,
          search: query.trim(),
          active: true,
          sort: "lastName",
          order: "asc"
        },
        controller.signal
      )
        .then((response) => {
          if (requestId.current !== currentRequest) {
            return;
          }
          setResults(response.items);
          setHighlightedIndex(response.items.length > 0 ? 0 : -1);
        })
        .catch((caught) => {
          if (requestId.current !== currentRequest || isAbortError(caught)) {
            return;
          }
          setResults([]);
          setHighlightedIndex(-1);
          setError(toSearchError(caught));
        })
        .finally(() => {
          if (requestId.current === currentRequest) {
            setIsLoading(false);
          }
        });
    }, PATIENT_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [token, query, isOpen, selectedPatient, retryKey]);

  function selectPatient(patient: PatientListItem) {
    onChange(patient);
    setQuery(patientDisplayName(patient));
    setResults([]);
    setIsOpen(false);
    setHighlightedIndex(-1);
    setError(null);
  }

  function clearSelection() {
    onChange(null);
    setQuery("");
    setResults([]);
    setIsOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function returnToSearch() {
    onChange(null);
    setIsOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((current) => {
        if (results.length === 0) {
          return -1;
        }
        return current < results.length - 1 ? current + 1 : 0;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((current) => {
        if (results.length === 0) {
          return -1;
        }
        return current > 0 ? current - 1 : results.length - 1;
      });
      return;
    }

    if (event.key === "Enter" && isOpen && highlightedIndex >= 0) {
      event.preventDefault();
      const patient = results[highlightedIndex];
      if (patient) {
        selectPatient(patient);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  }

  if (selectedPatient) {
    return (
      <section className="patient-picker-selected" aria-label="Wybrany pacjent">
        <div>
          <span className="summary-label">Pacjent</span>
          <strong>{patientDisplayName(selectedPatient)}</strong>
          <span className="patient-picker-meta">
            Data urodzenia: {formatDateOnly(selectedPatient.birthDate)} ·{" "}
            {maskPatientIdentifier(selectedPatient)}
          </span>
        </div>
        <div className="patient-picker-actions">
          <Link className="secondary-link" to={`/patients/${selectedPatient.id}`}>
            Szczegóły pacjenta
          </Link>
          <button type="button" className="secondary-button" onClick={returnToSearch}>
            Wróć do wyszukiwania
          </button>
          <button type="button" className="secondary-button" onClick={clearSelection}>
            Wyczyść wybór
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="patient-picker">
      <label htmlFor={inputId}>Pacjent</label>
      <div className="patient-picker-control">
        <input
          id={inputId}
          ref={inputRef}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={
            highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined
          }
          aria-describedby={statusId}
          value={query}
          placeholder="Imię, nazwisko, PESEL albo dokument"
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
          onKeyDown={handleKeyDown}
        />
        {query ? (
          <button
            type="button"
            className="patient-picker-clear"
            aria-label="Wyczyść wyszukiwanie pacjenta"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery("");
              setResults([]);
              inputRef.current?.focus();
            }}
          >
            Wyczyść
          </button>
        ) : null}
      </div>

      <div id={statusId} className="patient-picker-status" role="status" aria-live="polite">
        {isLoading ? "Ładowanie pacjentów..." : null}
        {!isLoading && !error && isOpen && results.length === 0
          ? "Brak wyników dla podanych danych."
          : null}
      </div>

      {error ? (
        <div className="patient-picker-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="secondary-button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setRetryKey((current) => current + 1)}
          >
            Ponów wyszukiwanie
          </button>
        </div>
      ) : null}

      {isOpen && results.length > 0 && !error ? (
        <ul id={listboxId} className="patient-picker-list" role="listbox" aria-label="Wyniki wyszukiwania pacjentów">
          {results.map((patient, index) => (
            <li
              id={`${listboxId}-option-${index}`}
              key={patient.id}
              role="option"
              aria-selected={index === highlightedIndex}
              className={index === highlightedIndex ? "is-highlighted" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => selectPatient(patient)}
            >
              <strong>{patientDisplayName(patient)}</strong>
              <span>
                Data urodzenia: {formatDateOnly(patient.birthDate)} · {maskPatientIdentifier(patient)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <Link className="patient-picker-new-link" to="/patients/new">
        Dodaj nowego pacjenta
      </Link>
    </div>
  );
}

function isAbortError(caught: unknown) {
  return caught instanceof DOMException && caught.name === "AbortError";
}

function toSearchError(caught: unknown) {
  if (caught instanceof ApiClientError) {
    return caught.correlationId
      ? `${caught.message} Identyfikator błędu: ${caught.correlationId}`
      : caught.message;
  }
  return "Nie udało się pobrać pacjentów.";
}
