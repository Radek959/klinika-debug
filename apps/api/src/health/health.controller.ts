import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthService } from "./health.service";

@ApiTags("Stan aplikacji")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("live")
  @ApiOperation({
    summary: "Proces działa",
    description: "Potwierdza, że proces aplikacji odpowiada na żądania."
  })
  live() {
    return this.healthService.live();
  }

  @Get("ready")
  @ApiOperation({
    summary: "Aplikacja gotowa",
    description: "Sprawdza połączenie z bazą MySQL i gotowość aplikacji."
  })
  ready() {
    return this.healthService.ready();
  }
}
