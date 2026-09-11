import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
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
import { ApiErrorResponseDto } from "../common/errors/api-error-response.dto";
import {
  ApiCorrelationIdHeader,
  ApiPatientIdParam,
  ApiSessionUnauthorizedResponse
} from "../common/openapi/openapi.helpers";
import { PatientListQueryDto } from "./dto/patient-list-query.dto";
import {
  PatientResponseDto,
  PatientsListResponseDto
} from "./dto/patient-response.dto";
import {
  CREATE_PATIENT_REQUEST_EXAMPLES,
  CreatePatientDto,
  UPDATE_PATIENT_REQUEST_EXAMPLES,
  UpdatePatientDto
} from "./dto/patient-write.dto";
import {
  DUPLICATE_DOCUMENT_EXAMPLE,
  DUPLICATE_PESEL_EXAMPLE,
  PATIENTS_QUERY_VALIDATION_ERROR_EXAMPLE,
  PATIENT_NOT_FOUND_EXAMPLE,
  PATIENT_VALIDATION_ERROR_EXAMPLES
} from "./dto/patient-error-examples";
import { PatientsService } from "./patients.service";

const PATIENT_LIST_SUCCESS_EXAMPLE = {
  listaPacjentow: {
    summary: "Lista pacjentów bieżącej placówki",
    value: {
      items: [
        {
          id: "clpatient0001",
          firstName: "Łukasz",
          lastName: "Nowak-Testowy",
          identifierType: "PESEL",
          pesel: "44051401458",
          documentType: null,
          documentNumber: null,
          documentCountry: null,
          birthDate: "1944-05-14",
          gender: "MALE",
          active: true,
          createdAt: "2026-09-06T12:00:00.000Z",
          updatedAt: "2026-09-06T12:00:00.000Z"
        }
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1
    }
  }
};

@ApiTags("Pacjenci")
@ApiBearerAuth()
@ApiCorrelationIdHeader()
@UseGuards(AuthGuard)
@Controller("patients")
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  @ApiOperation({
    summary: "Utworzenie pacjenta",
    description:
      "Tworzy pacjenta w bieżącym workspace’ie. Workspace pochodzi wyłącznie z aktywnej sesji. Obsługiwani są pacjenci z PESEL-em, pacjenci z innym dokumentem oraz opcjonalny opiekun. Nie mieszaj danych PESEL i OTHER_DOCUMENT w jednym żądaniu."
  })
  @ApiBody({ type: CreatePatientDto, examples: CREATE_PATIENT_REQUEST_EXAMPLES })
  @ApiCreatedResponse({
    type: PatientResponseDto,
    description: "Pacjent został utworzony."
  })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: "Żądanie ma nieprawidłową strukturę (np. brakujące pole albo złe typy)."
  })
  @ApiSessionUnauthorizedResponse()
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: "W bieżącej placówce istnieje już pacjent z tym PESEL-em albo dokumentem.",
    examples: { ...DUPLICATE_PESEL_EXAMPLE, ...DUPLICATE_DOCUMENT_EXAMPLE }
  })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorResponseDto,
    description: "Dane pacjenta naruszają reguły biznesowe.",
    examples: PATIENT_VALIDATION_ERROR_EXAMPLES
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
    description: "Lista pacjentów z bieżącej placówki.",
    examples: PATIENT_LIST_SUCCESS_EXAMPLE
  })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: "Niepoprawne parametry zapytania (paginacja, sortowanie albo filtry).",
    examples: PATIENTS_QUERY_VALIDATION_ERROR_EXAMPLE
  })
  @ApiSessionUnauthorizedResponse()
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
  @ApiPatientIdParam()
  @ApiOkResponse({
    type: PatientResponseDto,
    description: "Szczegółowe dane pacjenta z bieżącej placówki."
  })
  @ApiSessionUnauthorizedResponse()
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: "Pacjent nie istnieje albo należy do innego workspace’u.",
    examples: PATIENT_NOT_FOUND_EXAMPLE
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
  @ApiPatientIdParam()
  @ApiBody({ type: UpdatePatientDto, examples: UPDATE_PATIENT_REQUEST_EXAMPLES })
  @ApiOkResponse({
    type: PatientResponseDto,
    description: "Pacjent został zaktualizowany."
  })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: "Żądanie ma nieprawidłową strukturę (np. złe typy pól)."
  })
  @ApiSessionUnauthorizedResponse()
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: "Pacjent nie istnieje albo należy do innego workspace’u.",
    examples: PATIENT_NOT_FOUND_EXAMPLE
  })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: "W bieżącej placówce istnieje już pacjent z tym PESEL-em albo dokumentem.",
    examples: { ...DUPLICATE_PESEL_EXAMPLE, ...DUPLICATE_DOCUMENT_EXAMPLE }
  })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorResponseDto,
    description: "Dane pacjenta naruszają reguły biznesowe.",
    examples: PATIENT_VALIDATION_ERROR_EXAMPLES
  })
  async update(
    @Param("patientId") patientId: string,
    @Body() body: UpdatePatientDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<PatientResponse> {
    return this.patientsService.update(user.workspace.id, patientId, body);
  }
}
