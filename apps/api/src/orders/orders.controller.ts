import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiOkResponse
} from "@nestjs/swagger";
import type {
  AuthenticatedUser,
  OrderResponse,
  OrdersListResponse,
  OrderDetailsResponse
} from "@klinika/api-contracts";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ApiErrorResponseDto } from "../common/errors/api-error-response.dto";
import { CreateOrderDto } from "./dto/create-order.dto";
import { OrderResponseDto } from "./dto/order-response.dto";
import { OrdersListQueryDto } from "./dto/orders-list-query.dto";
import { OrdersListResponseDto } from "./dto/orders-list-response.dto";
import { OrderDetailsResponseDto } from "./dto/order-details-response.dto";
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

  @Get()
  @ApiOperation({
    summary: "Lista zleceń z bieżącego workspace'u",
    description:
      "Zwraca paginowaną listę zleceń z filtrowaniem, wyszukiwaniem i sortowaniem. Obsługuje filtry po statusie, priorytecie, pacjencie, rodzaju materiału i zakresie dat. Wyszukiwanie działa bez rozróżniania wielkości liter po identyfikatorach, danych pacjenta i kodach badań."
  })
  @ApiOkResponse({
    type: OrdersListResponseDto,
    description: "Paginowana lista zleceń."
  })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: "Niepoprawne parametry zapytania."
  })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: "Brak poprawnego tokenu Bearer konta personelu."
  })
  async list(
    @Query() query: OrdersListQueryDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OrdersListResponse> {
    return this.ordersService.list(user.workspace.id, query);
  }

  @Get(":orderId")
  @ApiOperation({
    summary: "Szczegóły zlecenia",
    description:
      "Zwraca pełne dane zlecenia, w tym informacje o pacjencie, badaniach i próbkach. Zlecenie musi należeć do bieżącego workspace'u."
  })
  @ApiOkResponse({
    type: OrderDetailsResponseDto,
    description: "Szczegółowe dane zlecenia."
  })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: "Niepoprawny identyfikator zlecenia."
  })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: "Brak poprawnego tokenu Bearer konta personelu."
  })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description:
      "Zlecenie nie istnieje albo należy do innego workspace'u."
  })
  async getById(
    @Param("orderId") orderId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OrderDetailsResponse> {
    return this.ordersService.getById(user.workspace.id, orderId);
  }
}
