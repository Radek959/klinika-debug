import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser, DashboardSummaryResponse } from "@klinika/api-contracts";
import { DashboardSummaryResponseDto } from "./dto/dashboard-summary-response.dto";
import { DashboardService } from "./dashboard.service";

@ApiTags("Panel główny")
@ApiBearerAuth()
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
    description: "Podsumowanie bieżącej placówki."
  })
  async getSummary(
    @CurrentUser() user: AuthenticatedUser
  ): Promise<DashboardSummaryResponse> {
    return this.dashboardService.getSummary(user.workspace.id);
  }
}
