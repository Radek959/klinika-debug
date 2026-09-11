import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";
import type { MedicalTestsListResponse } from "@klinika/api-contracts";
import { AuthGuard } from "../auth/auth.guard";
import { ApiErrorResponseDto } from "../common/errors/api-error-response.dto";
import { ApiSessionUnauthorizedResponse } from "../common/openapi/openapi.helpers";
import { MedicalTestListQueryDto } from "./dto/medical-test-list-query.dto";
import { MedicalTestsListResponseDto } from "./dto/medical-test-response.dto";
import { TestsCatalogService } from "./tests-catalog.service";

const MEDICAL_TESTS_SUCCESS_EXAMPLE = {
  katalogBadan: {
    summary: "Katalog badań (zwykłe badanie i badanie z wymaganym polem dodatkowym)",
    value: {
      items: [
        {
          id: "cltestcrp0001",
          code: "CRP",
          name: "CRP",
          description: "Syntetyczne badanie demonstracyjne surowicy.",
          materialType: "SERUM",
          estimatedDurationMinutes: 5,
          active: true,
          parameters: [
            {
              code: "CRP",
              name: "CRP",
              valueType: "NUMERIC",
              unit: "mg/L",
              displayOrder: 1
            }
          ],
          requiredFields: []
        },
        {
          id: "cltestglu0001",
          code: "GLU",
          name: "Glukoza",
          description: "Syntetyczne badanie demonstracyjne surowicy.",
          materialType: "SERUM",
          estimatedDurationMinutes: 5,
          active: true,
          parameters: [
            {
              code: "GLU",
              name: "Glukoza",
              valueType: "NUMERIC",
              unit: "mg/dL",
              displayOrder: 1
            }
          ],
          requiredFields: [
            {
              code: "PATIENT_PREPARED",
              label: "Potwierdzenie przygotowania pacjenta",
              valueType: "BOOLEAN",
              required: true,
              displayOrder: 1
            }
          ]
        }
      ],
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
      catalogFlag: false
    }
  }
};

@ApiTags("Katalog badań")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("tests")
export class TestsCatalogController {
  constructor(private readonly testsCatalogService: TestsCatalogService) {}

  @Get()
  @ApiOperation({
    summary: "Katalog badań",
    description:
      "Zwraca wspólny katalog badań dostępny dla wszystkich placówek. Endpoint wymaga sesji personelu, ale katalog nie zawiera danych workspace’u i nie przyjmuje workspaceId w parametrach. " +
      "Pole `id` każdej pozycji katalogu jest identyfikatorem, który należy podać jako `medicalTestId` przy tworzeniu zlecenia (POST /api/v1/orders). " +
      "Badanie GLU pokazuje przykład wymaganego pola dodatkowego (`requiredFields`, kod PATIENT_PREPARED) — jego wartość trzeba podać w `additionalData` przy tworzeniu zlecenia."
  })
  @ApiOkResponse({
    type: MedicalTestsListResponseDto,
    description:
      "Lista badań katalogowych z parametrami wyników i wymaganymi polami dodatkowymi.",
    examples: MEDICAL_TESTS_SUCCESS_EXAMPLE
  })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: "Niepoprawne parametry filtrowania, sortowania albo paginacji."
  })
  @ApiSessionUnauthorizedResponse()
  async list(
    @Query() query: MedicalTestListQueryDto
  ): Promise<MedicalTestsListResponse> {
    return this.testsCatalogService.list(query);
  }
}
