import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnprocessableEntityResponse,
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
import { CreatePatientDto, UpdatePatientDto } from "./dto/patient-write.dto";
import { PatientsService } from "./patients.service";

@ApiTags("Pacjenci")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("patients")
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  @ApiOperation({
    summary: "Utworzenie pacjenta",
    description:
      "Tworzy pacjenta w bieżącym workspace’ie. Workspace pochodzi wyłącznie z aktywnej sesji. Obsługiwani są pacjenci z PESEL-em, pacjenci z innym dokumentem oraz opcjonalny opiekun."
  })
  @ApiBody({ type: CreatePatientDto })
  @ApiCreatedResponse({
    type: PatientResponseDto,
    description: "Pacjent został utworzony."
  })
  @ApiConflictResponse({
    description: "W bieżącej placówce istnieje już pacjent z tym PESEL-em albo dokumentem."
  })
  @ApiUnprocessableEntityResponse({
    description: "Dane pacjenta naruszają reguły biznesowe."
  })
  async create(
    @Body() body: CreatePatientDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<PatientResponse> {
    return this.patientsService.create(user.workspace.id, body);
  }

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

  @Patch(":patientId")
  @ApiOperation({
    summary: "Aktualizacja pacjenta",
    description:
      "Aktualizuje pacjenta częściowo, ale waliduje pełny stan końcowy. Pacjent z innego workspace’u jest traktowany jak nieistniejący zasób. Pole guardian pominięte nie zmienia opiekuna, obiekt tworzy albo aktualizuje opiekuna, a null usuwa opiekuna tylko wtedy, gdy pacjent nie wymaga opiekuna."
  })
  @ApiBody({ type: UpdatePatientDto })
  @ApiOkResponse({
    type: PatientResponseDto,
    description: "Pacjent został zaktualizowany."
  })
  @ApiNotFoundResponse({
    description: "Pacjent nie istnieje albo należy do innego workspace’u."
  })
  @ApiConflictResponse({
    description: "W bieżącej placówce istnieje już pacjent z tym PESEL-em albo dokumentem."
  })
  @ApiUnprocessableEntityResponse({
    description: "Dane pacjenta naruszają reguły biznesowe."
  })
  async update(
    @Param("patientId") patientId: string,
    @Body() body: UpdatePatientDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<PatientResponse> {
    return this.patientsService.update(user.workspace.id, patientId, body);
  }
}
