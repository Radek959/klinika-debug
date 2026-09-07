import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import { ApiErrorResponseDto } from "../common/errors/api-error-response.dto";
import { LabResultsWebhookDto } from "./dto/lab-results-webhook.dto";
import { LabCallbacksService } from "./lab-callbacks.service";
import { LabWebhookGuard } from "./lab-webhook.guard";

@ApiTags("Integracja z laboratorium")
@ApiHeader({
  name: "X-Lab-Webhook-Secret",
  description: "Sekret techniczny webhooka laboratorium, niezależny od tokenu Bearer uczestnika."
})
@UseGuards(LabWebhookGuard)
@Controller("integrations/lab")
export class LabCallbacksController {
  constructor(private readonly labCallbacksService: LabCallbacksService) {}

  @Post("results")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Odbiór wyników z laboratorium",
    description:
      "Webhook przyjmujący wyniki badań od symulatora laboratorium. Uwierzytelnienie jest niezależne od kont personelu. Ponowne dostarczenie tego samego eventId nie duplikuje wyników.\n\nStatus `REJECTED` oznacza terminalne odrzucenie co najmniej jednej próbki zlecenia: wymaga niepustej listy `rejectedSamples`, pustej listy `pendingMedicalTestIds` i może zawierać wyniki badań wykonanych z nieodrzuconych próbek. Statusy `PARTIAL` i `COMPLETED` nie dopuszczają listy `rejectedSamples`."
  })
  @ApiNoContentResponse({ description: "Wyniki zostały przyjęte i zapisane." })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description:
      "Payload callbacka narusza kontrakt, na przykład brak `rejectedSamples` dla statusu REJECTED albo wskazanie próbki spoza zlecenia."
  })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: "Zlecenie jest w statusie terminalnym i nie przyjmuje już callbacków."
  })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: "Brak albo nieprawidłowy sekret webhooka."
  })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: "Nie znaleziono zlecenia dla podanego externalOrderId."
  })
  async receiveResults(@Body() body: LabResultsWebhookDto): Promise<void> {
    await this.labCallbacksService.processResults(body);
  }
}

