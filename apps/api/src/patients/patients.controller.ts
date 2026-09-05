import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type {
  AuthenticatedUser,
  PatientResponse,
  PatientsListResponse
} from "@klinika/api-contracts";
import { PatientListQueryDto } from "./dto/patient-list-query.dto";
import {
  PatientResponseDto,
  PatientsListResponseDto
} from "./dto/patient-response.dto";
import { PatientsService } from "./patients.service";

@ApiTags("Pacjenci")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("patients")
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @ApiOperation({
    summary: "Lista pacjentów",
    description:
      "Zwraca pacjentów z bieżącego workspace’u z paginacją, wyszukiwaniem, filtrowaniem i sortowaniem po stronie API."
  })
  @ApiOkResponse({
    type: PatientsListResponseDto,
    description: "Lista pacjentów z bieżącej placówki."
  })
  async list(
    @Query() query: PatientListQueryDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<PatientsListResponse> {
    return this.patientsService.list(user.workspace.id, query);
  }

  @Get(":patientId")
  @ApiOperation({
    summary: "Szczegóły pacjenta",
    description:
      "Zwraca szczegóły pacjenta z bieżącego workspace’u. Pacjent z innego workspace’u jest traktowany jak nieistniejący zasób."
  })
  @ApiOkResponse({
    type: PatientResponseDto,
    description: "Szczegółowe dane pacjenta z bieżącej placówki."
  })
  @ApiNotFoundResponse({
    description: "Pacjent nie istnieje albo należy do innego workspace’u."
  })
  async getById(
    @Param("patientId") patientId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<PatientResponse> {
    return this.patientsService.getById(user.workspace.id, patientId);
  }
}
