import { describe, expect, it } from "vitest";
import {
  emptyPatientForm,
  hasPatientChanges,
  toCreatePatientPayload,
  toUpdatePatientPayload,
  type PatientFormState
} from "./patientFormState";

describe("patientFormState", () => {
  it("wysyła częściowy PATCH przy zmianie tylko e-maila opiekuna", () => {
    const initial = formWithGuardian();
    const current = {
      ...initial,
      guardianEmail: "nowy@example.test"
    };

    expect(toUpdatePatientPayload(current, initial)).toEqual({
      guardian: {
        email: "nowy@example.test"
      }
    });
  });

  it("wysyła null przy wyczyszczeniu e-maila opiekuna", () => {
    const initial = formWithGuardian();
    const current = {
      ...initial,
      guardianEmail: ""
    };

    expect(toUpdatePatientPayload(current, initial)).toEqual({
      guardian: {
        email: null
      }
    });
  });

  it("wysyła pełny obiekt przy dodaniu nowego opiekuna", () => {
    const initial = baseForm();
    const current = {
      ...initial,
      guardianEnabled: true,
      guardianFirstName: "Marta",
      guardianLastName: "Nowak",
      guardianPhone: "500600700",
      guardianEmail: "marta@example.test"
    };

    expect(toUpdatePatientPayload(current, initial)).toEqual({
      guardian: {
        firstName: "Marta",
        lastName: "Nowak",
        phone: "500600700",
        email: "marta@example.test"
      }
    });
  });

  it("wysyła guardian null przy usunięciu opiekuna dorosłego pacjenta", () => {
    const initial = formWithGuardian();
    const current = {
      ...initial,
      guardianEnabled: false
    };

    expect(toUpdatePatientPayload(current, initial)).toEqual({
      guardian: null
    });
  });

  it("nie usuwa opiekuna niepełnoletniego pacjenta", () => {
    const initial = {
      ...formWithGuardian(),
      birthDate: "2020-01-01"
    };
    const current = {
      ...initial,
      guardianEnabled: false
    };

    expect(toUpdatePatientPayload(current, initial)).toEqual({});
  });

  it("nie dodaje guardian do PATCH, jeżeli opiekun się nie zmienił", () => {
    const initial = formWithGuardian();

    expect(toUpdatePatientPayload(initial, initial)).toEqual({});
    expect(hasPatientChanges(initial, initial)).toBe(false);
  });

  it("czyści poprzednie pola przy zmianie typu identyfikatora", () => {
    const initial = baseForm();
    const current = {
      ...initial,
      identifierType: "OTHER_DOCUMENT" as const,
      documentType: "PASSPORT",
      documentNumber: "AB123456",
      documentCountry: "PL"
    };

    expect(toUpdatePatientPayload(current, initial)).toEqual({
      identifierType: "OTHER_DOCUMENT",
      documentType: "PASSPORT",
      documentNumber: "AB123456",
      documentCountry: "PL",
      pesel: null
    });
  });

  it("nie wysyła workspaceId w payloadzie tworzenia", () => {
    expect(toCreatePatientPayload(baseForm())).not.toHaveProperty("workspaceId");
  });
});

function baseForm(): PatientFormState {
  return {
    ...emptyPatientForm,
    firstName: "Anna",
    lastName: "Nowak",
    pesel: "44051401458",
    birthDate: "1990-01-01",
    gender: "FEMALE",
    phone: "500600700"
  };
}

function formWithGuardian(): PatientFormState {
  return {
    ...baseForm(),
    guardianEnabled: true,
    guardianFirstName: "Marta",
    guardianLastName: "Nowak",
    guardianPhone: "500600700",
    guardianEmail: "marta@example.test"
  };
}
