import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
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

const LAB_RESULTS_WEBHOOK_REQUEST_EXAMPLES = {
  wynikKompletny: {
    summary: "Komplet wyników (COMPLETED)",
    value: {
      externalOrderId: "lab-ext-0001",
      eventId: "evt-0001",
      correlationId: "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7",
      status: "COMPLETED",
      results: [
        {
          medicalTestId: "cltestcrp0001",
          parameters: [
            { code: "CRP", value: "4.20", unit: "mg/L", flag: "NORMAL" }
          ]
        }
      ],
      pendingMedicalTestIds: []
    }
  },
  probkaOdrzucona: {
    summary: "Terminalne odrzucenie próbki (REJECTED)",
    value: {
      externalOrderId: "lab-ext-0002",
      eventId: "evt-0002",
      status: "REJECTED",
      results: [],
      pendingMedicalTestIds: [],
      rejectedSamples: [
        {
          sampleId: "clx1sample0001",
          rejectionCode: "HEMOLYZED",
          rejectionReason: "Próbka zhemolizowana"
        }
      ]
    }
  }
};

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
    summary: "Odbiór wyników z laboratorium (techniczny webhook)",
    description:
      "Techniczny webhook integracji z symulatorem laboratorium — NIE jest to zwykła operacja uczestnika/personelu STAFF i nie przyjmuje tokenu Bearer sesji. " +
      "Uwierzytelnienie jest całkowicie niezależne od kont personelu i realizowane przez nagłówek X-Lab-Webhook-Secret. Ponowne dostarczenie tego samego eventId nie duplikuje wyników.\n\nStatus `REJECTED` oznacza terminalne odrzucenie co najmniej jednej próbki zlecenia: wymaga niepustej listy `rejectedSamples`, pustej listy `pendingMedicalTestIds` i może zawierać wyniki badań wykonanych z nieodrzuconych próbek. Statusy `PARTIAL` i `COMPLETED` nie dopuszczają listy `rejectedSamples`."
  })
  @ApiBody({ type: LabResultsWebhookDto, examples: LAB_RESULTS_WEBHOOK_REQUEST_EXAMPLES })
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

