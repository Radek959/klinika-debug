export type IdentifierType = "PESEL" | "OTHER_DOCUMENT";
export type Gender = "FEMALE" | "MALE";

export interface GuardianRequest {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface PatientWriteRequest {
  firstName?: string | null;
  lastName?: string | null;
  identifierType?: IdentifierType | null;
  pesel?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  documentCountry?: string | null;
  birthDate?: string | null;
  gender?: Gender | null;
  citizenship?: string | null;
  phone?: string | null;
  email?: string | null;
  addressStreet?: string | null;
  addressBuildingNumber?: string | null;
  addressApartmentNumber?: string | null;
  addressPostalCode?: string | null;
  addressCity?: string | null;
  addressCountry?: string | null;
  guardian?: GuardianRequest | null;
}

export interface CreatePatientRequest extends PatientWriteRequest {
  firstName: string;
  lastName: string;
  identifierType: IdentifierType;
  birthDate: string;
  gender: Gender;
}

export interface UpdatePatientRequest extends PatientWriteRequest {
  active?: boolean;
}

export interface GuardianResponse {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
}

export interface PatientListItem {
  id: string;
  firstName: string;
  lastName: string;
  identifierType: IdentifierType;
  pesel: string | null;
  documentType: string | null;
  documentNumber: string | null;
  documentCountry: string | null;
  birthDate: string;
  gender: Gender;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PatientResponse extends PatientListItem {
  citizenship: string | null;
  phone: string | null;
  email: string | null;
  addressStreet: string | null;
  addressBuildingNumber: string | null;
  addressApartmentNumber: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  addressCountry: string | null;
  guardian: GuardianResponse | null;
}

export interface PatientsListResponse {
  items: PatientListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
