import type {
  CreatePatientRequest,
  GuardianRequest,
  IdentifierType,
  PatientResponse,
  PatientWriteRequest,
  UpdatePatientRequest
} from "@klinika/api-contracts";
import { isMinorOnDate } from "@klinika/domain";
import { emptyAsNull } from "../ui/dates";

export interface PatientFormState {
  firstName: string;
  lastName: string;
  identifierType: IdentifierType;
  pesel: string;
  documentType: string;
  documentNumber: string;
  documentCountry: string;
  birthDate: string;
  gender: "FEMALE" | "MALE";
  citizenship: string;
  phone: string;
  email: string;
  addressStreet: string;
  addressBuildingNumber: string;
  addressApartmentNumber: string;
  addressPostalCode: string;
  addressCity: string;
  addressCountry: string;
  guardianEnabled: boolean;
  guardianFirstName: string;
  guardianLastName: string;
  guardianPhone: string;
  guardianEmail: string;
}

export const emptyPatientForm: PatientFormState = {
  firstName: "",
  lastName: "",
  identifierType: "PESEL",
  pesel: "",
  documentType: "",
  documentNumber: "",
  documentCountry: "",
  birthDate: "",
  gender: "FEMALE",
  citizenship: "",
  phone: "",
  email: "",
  addressStreet: "",
  addressBuildingNumber: "",
  addressApartmentNumber: "",
  addressPostalCode: "",
  addressCity: "",
  addressCountry: "PL",
  guardianEnabled: false,
  guardianFirstName: "",
  guardianLastName: "",
  guardianPhone: "",
  guardianEmail: ""
};

export function patientToFormState(patient: PatientResponse): PatientFormState {
  return {
    firstName: patient.firstName,
    lastName: patient.lastName,
    identifierType: patient.identifierType,
    pesel: patient.pesel ?? "",
    documentType: patient.documentType ?? "",
    documentNumber: patient.documentNumber ?? "",
    documentCountry: patient.documentCountry ?? "",
    birthDate: patient.birthDate,
    gender: patient.gender,
    citizenship: patient.citizenship ?? "",
    phone: patient.phone ?? "",
    email: patient.email ?? "",
    addressStreet: patient.addressStreet ?? "",
    addressBuildingNumber: patient.addressBuildingNumber ?? "",
    addressApartmentNumber: patient.addressApartmentNumber ?? "",
    addressPostalCode: patient.addressPostalCode ?? "",
    addressCity: patient.addressCity ?? "",
    addressCountry: patient.addressCountry ?? "",
    guardianEnabled: Boolean(patient.guardian),
    guardianFirstName: patient.guardian?.firstName ?? "",
    guardianLastName: patient.guardian?.lastName ?? "",
    guardianPhone: patient.guardian?.phone ?? "",
    guardianEmail: patient.guardian?.email ?? ""
  };
}

export function isMinorPatient(state: PatientFormState) {
  return state.birthDate
    ? isMinorOnDate(state.birthDate, new Date())
    : false;
}

export function toCreatePatientPayload(
  state: PatientFormState
): CreatePatientRequest {
  return toPatientPayload(state) as CreatePatientRequest;
}

export function toUpdatePatientPayload(
  current: PatientFormState,
  initial: PatientFormState
): UpdatePatientRequest {
  const currentPayload = toPatientPayload(current);
  const initialPayload = toPatientPayload(initial);
  const diff: UpdatePatientRequest = {};

  Object.entries(currentPayload).forEach(([key, value]) => {
    const typedKey = key as keyof PatientWriteRequest;
    if (typedKey === "guardian") {
      return;
    }
    if (!isEqualValue(value, initialPayload[typedKey])) {
      diff[typedKey] = value as never;
    }
  });

  if (current.identifierType !== initial.identifierType) {
    if (current.identifierType === "PESEL") {
      diff.documentType = null;
      diff.documentNumber = null;
      diff.documentCountry = null;
    } else {
      diff.pesel = null;
    }
  }

  const guardianDiff = getGuardianDiff(current, initial);
  if (guardianDiff.changed) {
    diff.guardian = guardianDiff.value;
  }

  return diff;
}

export function hasPatientChanges(
  current: PatientFormState,
  initial: PatientFormState
) {
  return Object.keys(toUpdatePatientPayload(current, initial)).length > 0;
}

function toPatientPayload(state: PatientFormState): PatientWriteRequest {
  const payload: PatientWriteRequest = {
    firstName: state.firstName.trim(),
    lastName: state.lastName.trim(),
    identifierType: state.identifierType,
    birthDate: state.birthDate,
    gender: state.gender,
    citizenship: emptyAsNull(state.citizenship),
    phone: emptyAsNull(state.phone),
    email: emptyAsNull(state.email),
    addressStreet: emptyAsNull(state.addressStreet),
    addressBuildingNumber: emptyAsNull(state.addressBuildingNumber),
    addressApartmentNumber: emptyAsNull(state.addressApartmentNumber),
    addressPostalCode: emptyAsNull(state.addressPostalCode),
    addressCity: emptyAsNull(state.addressCity),
    addressCountry: emptyAsNull(state.addressCountry)
  };

  if (state.identifierType === "PESEL") {
    payload.pesel = emptyAsNull(state.pesel);
  } else {
    payload.documentType = emptyAsNull(state.documentType);
    payload.documentNumber = emptyAsNull(state.documentNumber);
    payload.documentCountry = emptyAsNull(state.documentCountry);
  }

  if (shouldSendGuardian(state)) {
    payload.guardian = guardianPayload(state);
  }

  return payload;
}

function guardianPayload(state: PatientFormState): GuardianRequest {
  return {
    firstName: emptyAsNull(state.guardianFirstName),
    lastName: emptyAsNull(state.guardianLastName),
    phone: emptyAsNull(state.guardianPhone),
    email: emptyAsNull(state.guardianEmail)
  };
}

function shouldSendGuardian(state: PatientFormState) {
  // Semantycznie pusty formularz opiekuna (bez żadnych wypełnionych pól) dla
  // niepełnoletniego pacjenta oznacza "brak opiekuna", a nie "opiekun z
  // pustymi polami" — payload nie zawiera wtedy `guardian`, dzięki czemu
  // backend stosuje normalną regułę GUARDIAN_REQUIRED (albo kontrolowany bug
  // PATIENT_GUARDIAN, o którym frontend nic nie wie).
  return state.guardianEnabled || (isMinorPatient(state) && hasGuardianData(state));
}

function hasGuardianData(state: PatientFormState) {
  return (
    Boolean(emptyAsNull(state.guardianFirstName)) ||
    Boolean(emptyAsNull(state.guardianLastName)) ||
    Boolean(emptyAsNull(state.guardianPhone)) ||
    Boolean(emptyAsNull(state.guardianEmail))
  );
}

function getGuardianDiff(
  current: PatientFormState,
  initial: PatientFormState
): { changed: false } | { changed: true; value: GuardianRequest | null } {
  const currentHasGuardian = shouldSendGuardian(current);
  const initialHasGuardian = shouldSendGuardian(initial);

  if (!currentHasGuardian && initialHasGuardian) {
    return { changed: true, value: null };
  }

  if (currentHasGuardian && !initialHasGuardian) {
    return { changed: true, value: guardianPayload(current) };
  }

  if (!currentHasGuardian || !initialHasGuardian) {
    return { changed: false };
  }

  const currentGuardian = guardianPayload(current);
  const initialGuardian = guardianPayload(initial);
  const value: GuardianRequest = {};

  (["firstName", "lastName", "phone", "email"] as const).forEach((field) => {
    if (!isEqualValue(currentGuardian[field], initialGuardian[field])) {
      value[field] = currentGuardian[field];
    }
  });

  return Object.keys(value).length > 0
    ? { changed: true, value }
    : { changed: false };
}

function isEqualValue(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
