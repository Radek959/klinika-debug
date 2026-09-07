import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiOkResponse
} from "@nestjs/swagger";
import type {
  AuthenticatedUser,
  OrderResponse,
  OrdersListResponse,
  OrderDetailsResponse,
  OrderHistoryListResponse
} from "@klinika/api-contracts";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { CurrentCorrelationId } from "../common/correlation/current-correlation-id.decorator";
import { ApiErrorResponseDto } from "../common/errors/api-error-response.dto";
import { OrderHistoryQueryDto } from "../order-history/dto/order-history-query.dto";
import { OrderHistoryListResponseDto } from "../order-history/dto/order-history-response.dto";
import { CreateOrderDto } from "./dto/create-order.dto";
import { OrderResponseDto } from "./dto/order-response.dto";
import { OrdersListQueryDto } from "./dto/orders-list-query.dto";
import { OrdersListResponseDto } from "./dto/orders-list-response.dto";
import { OrderDetailsResponseDto } from "./dto/order-details-response.dto";
import { RegisterSampleDto } from "./dto/register-sample.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
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

  @Get(":orderId/history")
  @ApiOperation({
    summary: "Historia operacji zlecenia",
    description:
      "Zwraca paginowaną historię najważniejszych zdarzeń zlecenia (utworzenie, edycja, rejestracja próbek, " +
      "wysyłka do laboratorium, synchroniczne przyjęcie przez laboratorium, odebranie wyniku przez callback, " +
      "zmiana statusu) od najnowszego. Zlecenie musi należeć do bieżącego workspace'u."
  })
  @ApiOkResponse({
    type: OrderHistoryListResponseDto,
    description: "Paginowana historia operacji zlecenia, posortowana od najnowszego zdarzenia."
  })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: "Niepoprawne parametry paginacji."
  })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: "Brak poprawnego tokenu Bearer konta personelu."
  })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: "Zlecenie nie istnieje albo należy do innego workspace'u."
  })
  async getHistory(
    @Param("orderId") orderId: string,
    @Query() query: OrderHistoryQueryDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OrderHistoryListResponse> {
    return this.ordersService.getHistory(user.workspace.id, orderId, query);
  }

  @Patch(":orderId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Edycja wersji roboczej zlecenia",
    description:
      "Aktualizuje wyłącznie zlecenie w statusie DRAFT z bieżącego workspace’u. Request jest częściowy: można wysłać tylko zmienione pola patientId, priority albo tests. Pole tests oznacza kompletną docelową listę badań, a wymagane próbki są wyliczane automatycznie na podstawie materiałów. Nie można aktualizować pól technicznych, statusu, workspaceId, użytkownika tworzącego, próbek, kodów kreskowych, wyników ani danych integracji. Workspace pochodzi wyłącznie z aktywnej sesji."
  })
  @ApiBody({
    type: UpdateOrderDto,
    examples: {
      priorityOnly: {
        summary: "Zmiana priorytetu",
        value: { priority: "URGENT" }
      },
      patientOnly: {
        summary: "Zmiana pacjenta",
        value: { patientId: "clpatient0002" }
      },
      replaceTests: {
        summary: "Zastąpienie listy badań",
        value: {
          tests: [
            { medicalTestId: "cltestmorf0001" },
            { medicalTestId: "cltesturine0001" }
          ]
        }
      },
      additionalData: {
        summary: "Aktualizacja danych dodatkowych",
        value: {
          tests: [
            {
              medicalTestId: "cltestglu0001",
              additionalData: { PATIENT_PREPARED: false }
            }
          ]
        }
      }
    }
  })
  @ApiOkResponse({
    type: OrderResponseDto,
    description:
      "Zlecenie zostało zaktualizowane, a lista wymaganych próbek odzwierciedla docelowe badania."
  })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: "Niepoprawna struktura requestu, nieznane pole albo pusty PATCH."
  })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: "Brak poprawnego tokenu Bearer konta personelu."
  })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description:
      "Zlecenie albo wskazany pacjent nie istnieje w bieżącym workspace’u."
  })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorResponseDto,
    description:
      "Zlecenie nie jest w statusie DRAFT albo końcowy stan narusza reguły biznesowe."
  })
  async updateDraft(
    @Param("orderId") orderId: string,
    @Body() body: UpdateOrderDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OrderResponse> {
    return this.ordersService.updateDraft(user.workspace.id, orderId, user.id, body);
  }

  @Post(":orderId/samples")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Rejestracja pobrania próbki",
    description:
      "Rejestruje kod kreskowy i czas pobrania dla wymaganej próbki zlecenia. Po zarejestrowaniu wszystkich wymaganych próbek zlecenie automatycznie zmienia status na SAMPLE_COLLECTED, a po pierwszej z kolejnych próbek na SAMPLE_COLLECTION_IN_PROGRESS."
  })
  @ApiBody({
    type: RegisterSampleDto,
    examples: {
      serum: {
        summary: "Rejestracja próbki surowicy",
        value: {
          materialType: "SERUM",
          barcode: "SMP-2026-00042",
          collectedAt: "2026-09-06T10:15:00.000Z"
        }
      }
    }
  })
  @ApiOkResponse({
    type: OrderResponseDto,
    description: "Zlecenie zaktualizowane po zarejestrowaniu próbki."
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
    description: "Zlecenie nie istnieje albo należy do innego workspace'u."
  })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorResponseDto,
    description:
      "Rejestracja próbki narusza reguły biznesowe, np. zlecenie nie przyjmuje już próbek, rodzaj materiału nie jest wymagany, próbka została już zarejestrowana, kod kreskowy jest zajęty albo data pobrania jest spoza dozwolonego zakresu."
  })
  async registerSample(
    @Param("orderId") orderId: string,
    @Body() body: RegisterSampleDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<OrderResponse> {
    return this.ordersService.registerSample(
      user.workspace.id,
      orderId,
      user.id,
      body
    );
  }

  @Post(":orderId/send")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Wysłanie zlecenia do laboratorium",
    description:
      "Wysyła zlecenie w statusie SAMPLE_COLLECTED do laboratorium. Żądanie jest idempotentne w obrębie zlecenia — " +
      "ponowne wywołanie z tymi samymi danymi zwraca ten sam rezultat bez ponownej wysyłki. " +
      "Laboratorium może też nie przyjąć zlecenia i odrzucić je synchronicznie z kodem 422 " +
      "(LAB_ORDER_VALIDATION_ERROR). Takie odrzucenie nie jest błędem technicznym: zlecenie zostaje w statusie " +
      "SAMPLE_COLLECTED, pola integracji (externalOrderId, sentAt, estimatedCompletionAt) pozostają puste, nie " +
      "powstaje klucz idempotencji, a wysyłkę można ponowić. " +
      "Laboratorium może też chwilowo ograniczyć liczbę żądań i odpowiedzieć kodem 429 " +
      "(LAB_RATE_LIMITED). Wtedy Klinika Debug planuje automatyczne ponowienie wysyłki, a zlecenie " +
      "pozostaje tymczasowo w statusie SAMPLE_COLLECTED. Przy chwilowej niedostępności laboratorium " +
      "(HTTP 503, LAB_SERVER_ERROR) system wykonuje maksymalnie trzy automatyczne ponowienia po 15, " +
      "30 i 60 sekundach. Jeżeli wszystkie zakończą się błędem 5xx, zlecenie przechodzi do " +
      "TECHNICAL_ERROR."
  })
  @ApiOkResponse({
    type: OrderResponseDto,
    description:
      "Zlecenie przyjęte przez laboratorium: status SENT_TO_LAB, externalOrderId, correlationId i szacowany czas zakończenia."
  })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: "Brak poprawnego tokenu Bearer konta personelu."
  })
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: "Zlecenie nie istnieje albo należy do innego workspace'u."
  })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorResponseDto,
    description:
      "Zlecenia nie da się wysłać. Dwa różne przypadki dzielą ten sam kod HTTP i są rozróżniane przez error.code. " +
      "ORDER_SEND_ERROR — lokalna walidacja zlecenia przed wysyłką, np. zlecenie nie ma statusu SAMPLE_COLLECTED " +
      "albo pacjent jest nieaktywny; fieldErrors wskazują wtedy pola status i patientId. " +
      "LAB_ORDER_VALIDATION_ERROR — laboratorium odrzuciło poprawne zlecenie po swojej stronie; fieldErrors " +
      "zawierają błędy zgłoszone przez laboratorium (np. field tests, code LAB_TEST_NOT_SUPPORTED). " +
      "W obu przypadkach error.correlationId jest równy identyfikatorowi korelacji żądania i nagłówkowi " +
      "X-Correlation-ID odpowiedzi. Odrzucenie przez laboratorium zapisuje w historii zlecenia zdarzenie " +
      "LAB_ORDER_REJECTED i nie zmienia statusu zlecenia.",
    examples: {
      lokalnaWalidacjaZlecenia: {
        summary: "Lokalna walidacja zlecenia przed wysyłką",
        value: {
          error: {
            code: "ORDER_SEND_ERROR",
            message: "Nie udało się wysłać zlecenia do laboratorium.",
            correlationId: "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7",
            fieldErrors: [
              {
                field: "status",
                code: "ORDER_NOT_SENDABLE",
                message:
                  "Zlecenie można wysłać do laboratorium wyłącznie po zarejestrowaniu wszystkich próbek."
              }
            ]
          }
        }
      },
      odrzuceniePrzezLaboratorium: {
        summary: "Odrzucenie walidacyjne po stronie laboratorium",
        value: {
          error: {
            code: "LAB_ORDER_VALIDATION_ERROR",
            message: "Laboratorium odrzuciło zlecenie z powodu błędów walidacji.",
            correlationId: "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7",
            fieldErrors: [
              {
                field: "tests",
                code: "LAB_TEST_NOT_SUPPORTED",
                message: "Laboratorium nie obsługuje jednego z wybranych badań."
              }
            ]
          }
        }
      }
    }
  })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description:
      "Zlecenie zostało już wcześniej wysłane z innymi danymi (konflikt klucza idempotencji)."
  })
  @ApiResponse({
    status: 429,
    type: ApiErrorResponseDto,
    description:
      "Laboratorium chwilowo ograniczyło liczbę żądań i nie przyjęło zlecenia. To nie jest błąd " +
      "aplikacji ani błąd techniczny zlecenia: Klinika Debug zapisuje trwałe zadanie automatycznego " +
      "ponowienia wysyłki i ponawia ją samodzielnie, bez udziału personelu. Do czasu udanego ponowienia " +
      "zlecenie pozostaje w statusie SAMPLE_COLLECTED, a pola integracji (externalOrderId, sentAt, " +
      "estimatedCompletionAt) są puste; zlecenie NIE otrzymuje statusu TECHNICAL_ERROR. " +
      "Nagłówek Retry-After zawiera liczbę pełnych sekund do zaplanowanego ponowienia (15 sekund dla " +
      "pierwszej odpowiedzi); przy ręcznym powtórzeniu żądania w trakcie oczekiwania wskazuje pozostały " +
      "czas i nigdy nie jest ujemny. Powtórzone ręczne wywołanie w tym czasie nie tworzy duplikatu " +
      "wysyłki ani drugiego zadania ponowienia. error.correlationId jest równy identyfikatorowi korelacji " +
      "żądania i nagłówkowi X-Correlation-ID odpowiedzi. Po udanym ponowieniu kolejne identyczne wywołanie " +
      "zwraca wcześniej uzyskany rezultat wysyłki.",
    headers: {
      "Retry-After": {
        description:
          "Liczba pełnych sekund do automatycznego ponowienia wysyłki. Nigdy nie jest ujemna.",
        schema: { type: "integer", minimum: 0, example: 15 }
      },
      "X-Correlation-ID": {
        description: "Identyfikator korelacji żądania, ten sam co error.correlationId.",
        schema: { type: "string", example: "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7" }
      }
    },
    examples: {
      ograniczeniePrzepustowosci: {
        summary: "Laboratorium chwilowo ograniczyło liczbę żądań",
        value: {
          error: {
            code: "LAB_RATE_LIMITED",
            message:
              "Laboratorium chwilowo ograniczyło liczbę żądań. Wysyłka zostanie ponowiona automatycznie.",
            correlationId: "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7"
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 503,
    type: ApiErrorResponseDto,
    description:
      "Laboratorium jest chwilowo niedostępne i nie przyjęło zlecenia. Klinika Debug zapisuje jedno " +
      "trwałe zadanie automatycznego ponowienia wysyłki i ponawia komunikację maksymalnie trzy razy: " +
      "po 15, 30 i 60 sekundach. Początkowa próba ręczna nie jest liczona jako ponowienie. Do czasu " +
      "wyczerpania prób zlecenie pozostaje w statusie SAMPLE_COLLECTED, a pola integracji " +
      "(externalOrderId, sentAt, estimatedCompletionAt) są puste. Po trzeciej nieudanej próbie " +
      "automatycznej zlecenie przechodzi do TECHNICAL_ERROR, zadanie retry ma stan terminalny i nie " +
      "powstaje callback ani wynik. Powtórzone ręczne wywołanie w trakcie oczekiwania nie tworzy " +
      "duplikatu zadania, tylko zwraca bieżący błąd z aktualnym Retry-After. error.correlationId jest " +
      "równy nagłówkowi X-Correlation-ID odpowiedzi.",
    headers: {
      "Retry-After": {
        description:
          "Liczba pełnych sekund do automatycznego ponowienia wysyłki. Obecna w odpowiedzi oczekującej na kolejne ponowienie.",
        schema: { type: "integer", minimum: 0, example: 15 }
      },
      "X-Correlation-ID": {
        description: "Identyfikator korelacji żądania, ten sam co error.correlationId.",
        schema: { type: "string", example: "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7" }
      }
    },
    examples: {
      chwilowaNiedostepnoscLaboratorium: {
        summary: "Laboratorium chwilowo niedostępne",
        value: {
          error: {
            code: "LAB_SERVER_ERROR",
            message:
              "Laboratorium jest chwilowo niedostępne. Wysyłka zostanie ponowiona automatycznie.",
            correlationId: "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7"
          }
        }
      }
    }
  })
  async sendOrder(
    @Param("orderId") orderId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCorrelationId() correlationId: string
  ): Promise<OrderResponse> {
    return this.ordersService.sendOrder(user.workspace.id, orderId, user.id, correlationId);
  }
}
