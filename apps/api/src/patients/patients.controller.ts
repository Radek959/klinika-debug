import { Controller, Get, HttpStatus, Param, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ApiErrorException } from "../common/errors/api-error.exception";
import { PrismaService } from "../common/prisma/prisma.service";
import type { AuthenticatedUser } from "@klinika/api-contracts";

@ApiTags("Pacjenci")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("patients")
export class PatientsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":patientId")
  @ApiOperation({
    summary: "Szczegóły pacjenta",
    description:
      "Minimalny endpoint Etapu 1 używany do potwierdzenia izolacji workspace’u."
  })
  @ApiOkResponse({ description: "Zwraca pacjenta z bieżącego workspace’u." })
  @ApiNotFoundResponse({
    description: "Pacjent nie istnieje albo należy do innego workspace’u."
  })
  async getById(
    @Param("patientId") patientId: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        workspaceId: user.workspace.id
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        identifierType: true,
        active: true,
        createdAt: true,
        updatedAt: true
      }
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
}
