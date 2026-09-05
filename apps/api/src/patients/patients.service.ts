import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PatientsListResponse, PatientResponse } from "@klinika/api-contracts";
import { ApiErrorException } from "../common/errors/api-error.exception";
import { PrismaService } from "../common/prisma/prisma.service";
import type { PatientListQueryDto } from "./dto/patient-list-query.dto";
import { toPatientListItem, toPatientResponse } from "./patients.mapper";

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
