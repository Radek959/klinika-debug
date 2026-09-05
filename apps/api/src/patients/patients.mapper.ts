import type { Guardian, Patient } from "@prisma/client";
import type {
  GuardianResponse,
  PatientListItem,
  PatientResponse
} from "@klinika/api-contracts";

type PatientWithGuardian = Patient & { guardian: Guardian | null };

export function toPatientListItem(patient: Patient): PatientListItem {
  return {
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    identifierType: patient.identifierType,
    pesel: patient.pesel,
    documentType: patient.documentType,
    documentNumber: patient.documentNumber,
    documentCountry: patient.documentCountry,
    birthDate: formatDateOnly(patient.birthDate),
    gender: patient.gender,
    active: patient.active,
    createdAt: patient.createdAt.toISOString(),
    updatedAt: patient.updatedAt.toISOString()
  };
}

export function toPatientResponse(patient: PatientWithGuardian): PatientResponse {
  return {
    ...toPatientListItem(patient),
    citizenship: patient.citizenship,
    phone: patient.phone,
    email: patient.email,
    addressStreet: patient.addressStreet,
    addressBuildingNumber: patient.addressBuildingNumber,
    addressApartmentNumber: patient.addressApartmentNumber,
    addressPostalCode: patient.addressPostalCode,
    addressCity: patient.addressCity,
    addressCountry: patient.addressCountry,
    guardian: patient.guardian ? toGuardianResponse(patient.guardian) : null
  };
}

function toGuardianResponse(guardian: Guardian): GuardianResponse {
  return {
    id: guardian.id,
    firstName: guardian.firstName,
    lastName: guardian.lastName,
    phone: guardian.phone,
    email: guardian.email
  };
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
