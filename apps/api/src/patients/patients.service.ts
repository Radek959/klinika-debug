import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type Guardian, type Patient } from "@prisma/client";
import {
  validatePatientFinalState,
  type NormalizedPatientWriteState,
  type PatientWriteFieldError,
  type PatientWriteState
} from "@klinika/domain";
import type {
  CreatePatientRequest,
  PatientsListResponse,
  PatientResponse,
  UpdatePatientRequest
} from "@klinika/api-contracts";
import { ApiErrorException } from "../common/errors/api-error.exception";
import { PrismaService } from "../common/prisma/prisma.service";
import type { PatientListQueryDto } from "./dto/patient-list-query.dto";
import { toPatientListItem, toPatientResponse } from "./patients.mapper";

type PatientWithGuardian = Patient & { guardian: Guardian | null };

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    workspaceId: string,
    input: CreatePatientRequest
  ): Promise<PatientResponse> {
    const validation = validatePatientFinalState(
      {
        ...input,
        active: true
      },
      new Date()
    );

    if (!validation.valid) {
      throw this.patientValidationError(validation.errors);
    }

    await this.ensureIdentifierIsUnique(workspaceId, validation.value);

    try {
      const patient = await this.prisma.$transaction(async (tx) => {
        const createdPatient = await tx.patient.create({
          data: this.toPatientCreateData(workspaceId, validation.value)
        });

        if (validation.value.guardian) {
          await tx.guardian.create({
            data: {
              workspaceId,
              patientId: createdPatient.id,
              ...validation.value.guardian
            }
          });
        }

        return tx.patient.findUniqueOrThrow({
          where: { id: createdPatient.id },
          include: { guardian: true }
        });
      });

      return toPatientResponse(patient);
    } catch (error) {
      throw this.mapPrismaConflict(error);
    }
  }

  async list(
    workspaceId: string,
    query: PatientListQueryDto
  ): Promise<PatientsListResponse> {
    const where = this.buildWhere(workspaceId, query);
    const orderBy = this.buildOrderBy(query);
    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
        orderBy,
        skip,
        take: query.pageSize
      }),
      this.prisma.patient.count({ where })
    ]);

    return {
      items: items.map(toPatientListItem),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize)
    };
  }

  async getById(workspaceId: string, patientId: string): Promise<PatientResponse> {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        workspaceId
      },
      include: {
        guardian: true
      }
    });

    if (!patient) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "PATIENT_NOT_FOUND",
        "Nie znaleziono pacjenta."
      );
    }

    return toPatientResponse(patient);
  }

  async update(
    workspaceId: string,
    patientId: string,
    input: UpdatePatientRequest
  ): Promise<PatientResponse> {
    const existing = await this.findPatientInWorkspace(workspaceId, patientId);
    const finalState = this.mergePatientUpdate(existing, input);
    const validation = validatePatientFinalState(finalState, new Date());

    if (input.active === true) {
      const errors = validation.valid ? [] : validation.errors;
      throw this.patientValidationError([
        ...errors,
        { field: "active", code: "INVALID_ACTIVE_VALUE" }
      ]);
    }

    if (!validation.valid) {
      throw this.patientValidationError(validation.errors);
    }

    await this.ensureIdentifierIsUnique(workspaceId, validation.value, patientId);

    try {
      const patient = await this.prisma.$transaction(async (tx) => {
        await tx.patient.update({
          where: { workspaceId_id: { workspaceId, id: patientId } },
          data: this.toPatientUpdateData(validation.value)
        });

        if (input.guardian === null) {
          await tx.guardian.deleteMany({
            where: { workspaceId, patientId }
          });
        } else if (validation.value.guardian && input.guardian !== undefined) {
          await tx.guardian.upsert({
            where: { patientId },
            create: {
              workspaceId,
              patientId,
              ...validation.value.guardian
            },
            update: validation.value.guardian
          });
        }

        return tx.patient.findFirstOrThrow({
          where: { id: patientId, workspaceId },
          include: { guardian: true }
        });
      });

      return toPatientResponse(patient);
    } catch (error) {
      throw this.mapPrismaConflict(error);
    }
  }

  private buildWhere(
    workspaceId: string,
    query: PatientListQueryDto
  ): Prisma.PatientWhereInput {
    const search = query.search?.trim();

    return {
      workspaceId,
      ...(query.active ? { active: query.active === "true" } : {}),
      ...(query.identifierType ? { identifierType: query.identifierType } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search } },
              { lastName: { contains: search } },
              { pesel: { contains: search } },
              { documentNumber: { contains: search } }
            ]
          }
        : {})
    };
  }

  private buildOrderBy(query: PatientListQueryDto): Prisma.PatientOrderByWithRelationInput[] {
    return [
      { [query.sort]: query.order },
      { id: query.order }
    ];
  }

  private async findPatientInWorkspace(
    workspaceId: string,
    patientId: string
  ): Promise<PatientWithGuardian> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, workspaceId },
      include: { guardian: true }
    });

    if (!patient) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "PATIENT_NOT_FOUND",
        "Nie znaleziono pacjenta."
      );
    }

    return patient;
  }

  private mergePatientUpdate(
    existing: PatientWithGuardian,
    input: UpdatePatientRequest
  ): PatientWriteState {
    const identifierType = this.valueOrExisting(
      input,
      "identifierType",
      existing.identifierType
    );
    const guardian = this.mergeGuardianUpdate(existing.guardian, input);

    return {
      firstName: this.valueOrExisting(input, "firstName", existing.firstName),
      lastName: this.valueOrExisting(input, "lastName", existing.lastName),
      identifierType,
      pesel:
        identifierType === "OTHER_DOCUMENT"
          ? this.valueOrExisting(input, "pesel", null)
          : this.valueOrExisting(input, "pesel", existing.pesel),
      documentType:
        identifierType === "PESEL"
          ? this.valueOrExisting(input, "documentType", null)
          : this.valueOrExisting(input, "documentType", existing.documentType),
      documentNumber:
        identifierType === "PESEL"
          ? this.valueOrExisting(input, "documentNumber", null)
          : this.valueOrExisting(input, "documentNumber", existing.documentNumber),
      documentCountry:
        identifierType === "PESEL"
          ? this.valueOrExisting(input, "documentCountry", null)
          : this.valueOrExisting(input, "documentCountry", existing.documentCountry),
      birthDate: this.valueOrExisting(
        input,
        "birthDate",
        this.formatDateOnly(existing.birthDate)
      ),
      gender: this.valueOrExisting(input, "gender", existing.gender),
      citizenship: this.valueOrExisting(
        input,
        "citizenship",
        existing.citizenship
      ),
      phone: this.valueOrExisting(input, "phone", existing.phone),
      email: this.valueOrExisting(input, "email", existing.email),
      addressStreet: this.valueOrExisting(
        input,
        "addressStreet",
        existing.addressStreet
      ),
      addressBuildingNumber:
        this.valueOrExisting(
          input,
          "addressBuildingNumber",
          existing.addressBuildingNumber
        ),
      addressApartmentNumber:
        this.valueOrExisting(
          input,
          "addressApartmentNumber",
          existing.addressApartmentNumber
        ),
      addressPostalCode: this.valueOrExisting(
        input,
        "addressPostalCode",
        existing.addressPostalCode
      ),
      addressCity: this.valueOrExisting(input, "addressCity", existing.addressCity),
      addressCountry: this.valueOrExisting(
        input,
        "addressCountry",
        existing.addressCountry
      ),
      active: this.valueOrExisting(input, "active", existing.active),
      guardian
    };
  }

  private mergeGuardianUpdate(
    existing: Guardian | null,
    input: UpdatePatientRequest
  ): PatientWriteState["guardian"] {
    if (input.guardian === undefined) {
      return existing
        ? {
            firstName: existing.firstName,
            lastName: existing.lastName,
            phone: existing.phone,
            email: existing.email
          }
        : null;
    }

    if (input.guardian === null || !existing) {
      return input.guardian;
    }

    return {
      firstName: this.valueOrExisting(
        input.guardian,
        "firstName",
        existing.firstName
      ),
      lastName: this.valueOrExisting(input.guardian, "lastName", existing.lastName),
      phone: this.valueOrExisting(input.guardian, "phone", existing.phone),
      email: this.valueOrExisting(input.guardian, "email", existing.email)
    };
  }

  private valueOrExisting<T extends object, K extends keyof T>(
    input: T,
    key: K,
    existing: T[K]
  ): T[K] {
    return Object.prototype.hasOwnProperty.call(input, key) ? input[key] : existing;
  }

  private async ensureIdentifierIsUnique(
    workspaceId: string,
    patient: NormalizedPatientWriteState,
    excludePatientId?: string
  ) {
    if (patient.identifierType === "PESEL" && patient.pesel) {
      const duplicate = await this.prisma.patient.findFirst({
        where: {
          workspaceId,
          pesel: patient.pesel,
          ...(excludePatientId ? { id: { not: excludePatientId } } : {})
        },
        select: { id: true }
      });
      if (duplicate) {
        throw this.duplicatePeselError();
      }
    }

    if (
      patient.identifierType === "OTHER_DOCUMENT" &&
      patient.documentType &&
      patient.documentNumber &&
      patient.documentCountry
    ) {
      const duplicate = await this.prisma.patient.findFirst({
        where: {
          workspaceId,
          documentType: patient.documentType,
          documentNumber: patient.documentNumber,
          documentCountry: patient.documentCountry,
          ...(excludePatientId ? { id: { not: excludePatientId } } : {})
        },
        select: { id: true }
      });
      if (duplicate) {
        throw this.duplicateDocumentError();
      }
    }
  }

  private toPatientCreateData(
    workspaceId: string,
    patient: NormalizedPatientWriteState
  ): Prisma.PatientUncheckedCreateInput {
    return {
      workspaceId,
      ...this.toPatientData(patient)
    };
  }

  private toPatientUpdateData(
    patient: NormalizedPatientWriteState
  ): Prisma.PatientUncheckedUpdateInput {
    return this.toPatientData(patient);
  }

  private toPatientData(patient: NormalizedPatientWriteState) {
    return {
      firstName: patient.firstName,
      lastName: patient.lastName,
      identifierType: patient.identifierType,
      pesel: patient.pesel,
      documentType: patient.documentType,
      documentNumber: patient.documentNumber,
      documentCountry: patient.documentCountry,
      birthDate: new Date(`${patient.birthDate}T00:00:00.000Z`),
      gender: patient.gender,
      citizenship: patient.citizenship,
      phone: patient.phone,
      email: patient.email,
      addressStreet: patient.addressStreet,
      addressBuildingNumber: patient.addressBuildingNumber,
      addressApartmentNumber: patient.addressApartmentNumber,
      addressPostalCode: patient.addressPostalCode,
      addressCity: patient.addressCity,
      addressCountry: patient.addressCountry,
      active: patient.active
    };
  }

  private patientValidationError(errors: PatientWriteFieldError[]) {
    return new ApiErrorException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "PATIENT_VALIDATION_ERROR",
      "Nie udało się zapisać pacjenta.",
      errors.map((error) => ({
        ...error,
        message: this.fieldErrorMessage(error.code)
      }))
    );
  }

  private mapPrismaConflict(error: unknown): never {
    if (error instanceof ApiErrorException) {
      throw error;
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = String(error.meta?.target ?? "");
      if (target.includes("pesel")) {
        throw this.duplicatePeselError();
      }
      if (target.includes("document")) {
        throw this.duplicateDocumentError();
      }
    }

    throw error;
  }

  private duplicatePeselError() {
    return new ApiErrorException(
      HttpStatus.CONFLICT,
      "DUPLICATE_PESEL",
      "W tej placówce istnieje już pacjent z tym numerem PESEL.",
      [
        {
          field: "pesel",
          code: "DUPLICATE_PESEL",
          message: "W tej placówce istnieje już pacjent z tym numerem PESEL."
        }
      ]
    );
  }

  private duplicateDocumentError() {
    return new ApiErrorException(
      HttpStatus.CONFLICT,
      "DUPLICATE_DOCUMENT",
      "W tej placówce istnieje już pacjent z tym dokumentem.",
      [
        {
          field: "documentNumber",
          code: "DUPLICATE_DOCUMENT",
          message: "W tej placówce istnieje już pacjent z tym dokumentem."
        }
      ]
    );
  }

  private fieldErrorMessage(code: string): string {
    const messages: Record<string, string> = {
      REQUIRED: "Pole jest wymagane.",
      INVALID_NAME:
        "Pole może zawierać od 2 do 60 znaków: litery, spacje, apostrof i łącznik.",
      INVALID_DATE: "Data musi być poprawna i zapisana w formacie YYYY-MM-DD.",
      INVALID_PHONE: "Telefon musi mieć 9 cyfr albo format +48 i 9 cyfr.",
      INVALID_EMAIL: "Adres e-mail ma nieprawidłowy format.",
      INVALID_IDENTIFIER_FIELDS:
        "Dane identyfikatora muszą odpowiadać wybranemu typowi identyfikatora.",
      CONTACT_REQUIRED: "Podaj telefon albo e-mail pacjenta.",
      GUARDIAN_REQUIRED: "Dla pacjenta niepełnoletniego wymagany jest opiekun.",
      GUARDIAN_CONTACT_REQUIRED: "Podaj telefon albo e-mail opiekuna.",
      PESEL_BIRTH_DATE_MISMATCH:
        "Data urodzenia musi być zgodna z numerem PESEL.",
      PESEL_GENDER_MISMATCH: "Płeć musi być zgodna z numerem PESEL.",
      INVALID_ACTIVE_VALUE: "W tym etapie można tylko dezaktywować pacjenta.",
      INVALID_LENGTH: "Numer PESEL musi mieć dokładnie 11 cyfr.",
      INVALID_DIGITS: "Numer PESEL może zawierać wyłącznie cyfry.",
      INVALID_BIRTH_DATE: "Numer PESEL zawiera nieprawidłową datę urodzenia.",
      INVALID_CHECKSUM: "Numer PESEL ma nieprawidłową sumę kontrolną."
    };
    return messages[code] ?? "Pole ma nieprawidłową wartość.";
  }

  private formatDateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
