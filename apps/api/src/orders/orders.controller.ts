import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse
} from "@nestjs/swagger";
import type { AuthenticatedUser, OrderResponse } from "@klinika/api-contracts";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ApiErrorResponseDto } from "../common/errors/api-error-response.dto";
import { CreateOrderDto } from "./dto/create-order.dto";
import { OrderResponseDto } from "./dto/order-response.dto";
import { OrdersService } from "./orders.service";

@ApiTags("Zlecenia")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: "Utworzenie zlecenia badań",
    description:
      "Tworzy zlecenie w statusie DRAFT dla aktywnego pacjenta z bieżącego workspace’u. Workspace i użytkownik tworzący pochodzą wyłącznie z aktywnej sesji. Wybrane badania muszą istnieć w globalnym katalogu, być aktywne i mieć poprawne dane dodatkowe. System automatycznie tworzy wymagane próbki według materiałów badań."
  })
  @ApiBody({
    type: CreateOrderDto,
    examples: {
      routineWithGlu: {
        summary: "Zlecenie rutynowe z glukozą",
        value: {
          patientId: "clpatient0001",
          priority: "ROUTINE",
          tests: [
            {
              medicalTestId: "cltestglu0001",
              additionalData: {
                PATIENT_PREPARED: false
              }
            }
          ]
        }
      },
      multipleMaterials: {
        summary: "Badania wymagające kilku materiałów",
        value: {
          patientId: "clpatient0001",
          priority: "URGENT",
          tests: [
            { medicalTestId: "cltestmorf0001" },
            { medicalTestId: "cltestcrp0001" },
            { medicalTestId: "cltesturine0001" }
          ]
        }
      }
    }
  })
  @ApiCreatedResponse({
    type: OrderResponseDto,
    description:
      "Zlecenie zostało utworzone wraz z badaniami i wymaganymi próbkami. Przykłady katalogu używają jednostki glukozy mg/dL."
  })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: "Niepoprawna struktura requestu."
  })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: "Brak poprawnego tokenu Bearer konta personelu."
  })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description:
      "Pacjent nie istnieje albo należy do innego workspace’u."
  })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorResponseDto,
    description:
      "Zlecenie narusza reguły biznesowe, np. zawiera puste, powtórzone, nieaktywne albo niepoprawnie uzupełnione badania."
  })
  async create(
    @Body() body: CreateOrderDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OrderResponse> {
    return this.ordersService.create(user.workspace.id, user.id, body);
  }
}
