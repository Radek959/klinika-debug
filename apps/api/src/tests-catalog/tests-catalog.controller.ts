import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import type { MedicalTestsListResponse } from "@klinika/api-contracts";
import { AuthGuard } from "../auth/auth.guard";
import { ApiErrorResponseDto } from "../common/errors/api-error-response.dto";
import { MedicalTestListQueryDto } from "./dto/medical-test-list-query.dto";
import { MedicalTestsListResponseDto } from "./dto/medical-test-response.dto";
import { TestsCatalogService } from "./tests-catalog.service";

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
      "Zwraca wspólny katalog badań dostępny dla wszystkich placówek. Endpoint wymaga sesji personelu, ale katalog nie zawiera danych workspace’u i nie przyjmuje workspaceId w parametrach."
  })
  @ApiOkResponse({
    type: MedicalTestsListResponseDto,
    description:
      "Lista badań katalogowych z parametrami wyników i wymaganymi polami dodatkowymi."
  })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: "Niepoprawne parametry filtrowania, sortowania albo paginacji."
  })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: "Brak poprawnego tokenu Bearer konta personelu."
  })
  async list(
    @Query() query: MedicalTestListQueryDto
  ): Promise<MedicalTestsListResponse> {
    return this.testsCatalogService.list(query);
  }
}
