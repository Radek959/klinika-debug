import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
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
  @ApiOkResponse({
    description: "Proces API odpowiada na żądania.",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", example: "ok" },
        service: { type: "string", example: "klinika-debug-api" }
      }
    }
  })
  live() {
    return this.healthService.live();
  }

  @Get("ready")
  @ApiOperation({
    summary: "Aplikacja gotowa",
    description: "Sprawdza połączenie z bazą MySQL i gotowość aplikacji."
  })
  @ApiOkResponse({
    description: "Proces API działa i ma sprawne połączenie z bazą MySQL.",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", example: "ok" },
        database: { type: "string", example: "ok" }
      }
    }
  })
  ready() {
    return this.healthService.ready();
  }
}
