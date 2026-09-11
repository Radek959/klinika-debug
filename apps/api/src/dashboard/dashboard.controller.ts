import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser, DashboardSummaryResponse } from "@klinika/api-contracts";
import {
  ApiCorrelationIdHeader,
  ApiSessionUnauthorizedResponse
} from "../common/openapi/openapi.helpers";
import { DashboardSummaryResponseDto } from "./dto/dashboard-summary-response.dto";
import { DashboardService } from "./dashboard.service";

const DASHBOARD_SUMMARY_SUCCESS_EXAMPLE = {
  podsumowanie: {
    summary: "Podsumowanie bieżącej placówki",
    value: {
      patients: { total: 12, active: 10, inactive: 2 },
      orders: {
        total: 7,
        byStatus: {
          DRAFT: 1,
          SAMPLE_COLLECTION_IN_PROGRESS: 1,
          SAMPLE_COLLECTED: 1,
          SENT_TO_LAB: 1,
          PROCESSING: 1,
          PARTIAL: 0,
          COMPLETED: 2,
          REJECTED: 0,
          TECHNICAL_ERROR: 0
        }
      }
    }
  }
};

@ApiTags("Panel główny")
@ApiBearerAuth()
@ApiCorrelationIdHeader()
@UseGuards(AuthGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("summary")
  @ApiOperation({
    summary: "Podsumowanie workspace'u",
    description:
      "Zwraca liczbę pacjentów (łącznie, aktywni, nieaktywni) oraz liczbę zleceń w podziale na status, wyłącznie dla workspace'u zalogowanego użytkownika."
  })
  @ApiOkResponse({
    type: DashboardSummaryResponseDto,
    description: "Podsumowanie bieżącej placówki.",
    examples: DASHBOARD_SUMMARY_SUCCESS_EXAMPLE
  })
  @ApiSessionUnauthorizedResponse()
  async getSummary(
    @CurrentUser() user: AuthenticatedUser
  ): Promise<DashboardSummaryResponse> {
    return this.dashboardService.getSummary(user.workspace.id);
  }
}
