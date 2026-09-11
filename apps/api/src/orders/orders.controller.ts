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
import {
  ApiCorrelationIdHeader,
  ApiOrderIdParam,
  ApiSessionUnauthorizedResponse
} from "../common/openapi/openapi.helpers";
import { OrderHistoryQueryDto } from "../order-history/dto/order-history-query.dto";
import { OrderHistoryListResponseDto } from "../order-history/dto/order-history-response.dto";
import { CreateOrderDto } from "./dto/create-order.dto";
import { OrderResponseDto } from "./dto/order-response.dto";
import { OrdersListQueryDto } from "./dto/orders-list-query.dto";
import { OrdersListResponseDto } from "./dto/orders-list-response.dto";
import { OrderDetailsResponseDto } from "./dto/order-details-response.dto";
import { RegisterSampleDto } from "./dto/register-sample.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import {
  ORDER_CREATE_VALIDATION_ERROR_EXAMPLE,
  ORDER_NOT_FOUND_EXAMPLE,
  ORDER_UPDATE_EMPTY_PATCH_EXAMPLE,
  ORDER_UPDATE_VALIDATION_ERROR_EXAMPLE,
  SAMPLE_REGISTRATION_ERROR_EXAMPLES
} from "./dto/order-error-examples";
import { OrdersService } from "./orders.service";

const ORDERS_LIST_SUCCESS_EXAMPLE = {
  listaZlecen: {
    summary: "Paginowana lista zleceń",
    value: {
      items: [
        {
          id: "clorder0001",
          patient: {
            id: "clpatient0001",
            firstName: "Łukasz",
            lastName: "Nowak-Testowy",
            identifierType: "PESEL",
            pesel: "44051401458",
            documentType: null,
            documentNumber: null,
            documentCountry: null,
            birthDate: "1944-05-14",
            active: true
          },
          priority: "ROUTINE",
          status: "SENT_TO_LAB",
          tests: [
            { medicalTestId: "cltestglu0001", code: "GLU", name: "Glukoza", materialType: "SERUM" }
          ],
          samples: [{ materialType: "SERUM", status: "SENT" }],
          externalOrderId: "lab-ext-0001",
          correlationId: "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7",
          sentAt: "2026-09-06T12:05:00.000Z",
          estimatedCompletionAt: "2026-09-06T12:20:00.000Z",
          createdByUserId: "cluser0000001",
          createdAt: "2026-09-06T12:00:00.000Z",
          updatedAt: "2026-09-06T12:05:00.000Z"
        }
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1
    }
  }
};

const ORDER_DETAILS_SUCCESS_EXAMPLE = {
  szczegolyZlecenia: {
    summary: "Szczegóły zlecenia z wynikiem",
    value: {
      id: "clorder0001",
      patientId: "clpatient0001",
      priority: "ROUTINE",
      status: "COMPLETED",
      tests: [
        {
          id: "clordertest0001",
          medicalTestId: "cltestglu0001",
          code: "GLU",
          name: "Glukoza",
          materialType: "SERUM",
          status: "COMPLETED",
          additionalData: { PATIENT_PREPARED: false }
        }
      ],
      samples: [
        {
          id: "clsample0001",
          materialType: "SERUM",
          status: "ACCEPTED",
          barcode: "SMP-2026-00042",
          collectedAt: "2026-09-06T10:15:00.000Z",
          collectedByUserId: "cluser0000001",
          rejectionCode: null,
          rejectionReason: null
        }
      ],
      createdByUserId: "cluser0000001",
      externalOrderId: "lab-ext-0001",
      correlationId: "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7",
      sentAt: "2026-09-06T12:05:00.000Z",
      estimatedCompletionAt: "2026-09-06T12:20:00.000Z",
      createdAt: "2026-09-06T12:00:00.000Z",
      updatedAt: "2026-09-06T12:20:00.000Z",
      patient: {
        id: "clpatient0001",
        firstName: "Łukasz",
        lastName: "Nowak-Testowy",
        identifierType: "PESEL",
        pesel: "44051401458",
        documentType: null,
        documentNumber: null,
        documentCountry: null,
        birthDate: "1944-05-14",
        gender: "MALE",
        active: true,
        createdAt: "2026-09-06T12:00:00.000Z",
        updatedAt: "2026-09-06T12:00:00.000Z"
      },
      results: [
        {
          medicalTestId: "cltestglu0001",
          parameters: [
            {
              code: "GLU",
              value: "98",
              unit: "mg/dL",
              referenceRange: "70-99",
              flag: "NORMAL",
              resultedAt: "2026-09-06T12:20:00.000Z"
            }
          ]
        }
      ],
      labSendRetryPending: false
    }
  }
};

const ORDER_HISTORY_SUCCESS_EXAMPLE = {
  historiaZlecenia: {
    summary: "Historia zlecenia: utworzenie, rejestracja próbki, wysyłka",
    value: {
      items: [
        {
          id: "clhistory0003",
          eventType: "LAB_SEND_RETRY",
          occurredAt: "2026-09-06T12:15:00.000Z",
          actorType: "SYSTEM",
          actorUserId: null,
          actorDisplayName: null,
          correlationId: "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7",
          integrationEventId: null,
          previousStatus: "SAMPLE_COLLECTED",
          newStatus: "SENT_TO_LAB",
          details: {
            eventType: "LAB_SEND_RETRY",
            attemptNumber: 2,
            outcome: "ACCEPTED",
            previousStatus: "SAMPLE_COLLECTED",
            newStatus: "SENT_TO_LAB"
          }
        },
        {
          id: "clhistory0002",
          eventType: "SAMPLE_REGISTERED",
          occurredAt: "2026-09-06T12:10:00.000Z",
          actorType: "STAFF",
          actorUserId: "cluser0000001",
          actorDisplayName: "Tester Warsztatowy",
          correlationId: null,
          integrationEventId: null,
          previousStatus: "DRAFT",
          newStatus: "SAMPLE_COLLECTED",
          details: {
            eventType: "SAMPLE_REGISTERED",
            materialType: "SERUM",
            sampleId: "clsample0001",
            previousStatus: "DRAFT",
            newStatus: "SAMPLE_COLLECTED"
          }
        },
        {
          id: "clhistory0001",
          eventType: "ORDER_CREATED",
          occurredAt: "2026-09-06T12:00:00.000Z",
          actorType: "STAFF",
          actorUserId: "cluser0000001",
          actorDisplayName: "Tester Warsztatowy",
          correlationId: null,
          integrationEventId: null,
          previousStatus: null,
          newStatus: "DRAFT",
          details: {
            eventType: "ORDER_CREATED",
            priority: "ROUTINE",
            testCodes: ["GLU"],
            requiredMaterials: ["SERUM"],
            finalStatus: "DRAFT"
          }
        }
      ],
      meta: { page: 1, pageSize: 20, total: 3, totalPages: 1 }
    }
  }
};

@ApiTags("Zlecenia")
@ApiBearerAuth()
@ApiCorrelationIdHeader()
@UseGuards(AuthGuard)
@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: "Utworzenie zlecenia badań",
    description:
      "Tworzy zlecenie w statusie DRAFT dla aktywnego pacjenta z bieżącego workspace’u. Workspace i użytkownik tworzący pochodzą wyłącznie z aktywnej sesji. Wybrane badania muszą istnieć w globalnym katalogu, być aktywne i mieć poprawne dane dodatkowe. System automatycznie tworzy wymagane próbki według materiałów badań. " +
      "patientId pobierz z GET /api/v1/patients (albo z odpowiedzi POST /api/v1/patients), medicalTestId pobierz z GET /api/v1/tests."
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
  @ApiSessionUnauthorizedResponse()
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description:
      "Pacjent nie istnieje albo należy do innego workspace’u."
  })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorResponseDto,
    description:
      "Zlecenie narusza reguły biznesowe, np. zawiera puste, powtórzone, nieaktywne albo niepoprawnie uzupełnione badania.",
    examples: ORDER_CREATE_VALIDATION_ERROR_EXAMPLE
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
      "Zwraca paginowaną listę zleceń z filtrowaniem, wyszukiwaniem i sortowaniem. Obsługuje filtry po statusie, priorytecie, pacjencie, rodzaju materiału i zakresie dat. Wyszukiwanie działa bez rozróżniania wielkości liter po identyfikatorach, danych pacjenta i kodach badań.\n\n" +
      "Przykłady użycia parametrów zapytania:\n" +
      "- tylko zlecenia URGENT: ?priority=URGENT\n" +
      "- zlecenia jednego pacjenta: ?patientId=clpatient0001\n" +
      "- zlecenia w jednym statusie: ?status=SENT_TO_LAB\n" +
      "- zakres dat utworzenia: ?createdFrom=2026-09-01&createdTo=2026-09-07"
  })
  @ApiOkResponse({
    type: OrdersListResponseDto,
    description: "Paginowana lista zleceń.",
    examples: ORDERS_LIST_SUCCESS_EXAMPLE
  })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: "Niepoprawne parametry zapytania."
  })
  @ApiSessionUnauthorizedResponse()
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
  @ApiOrderIdParam()
  @ApiOkResponse({
    type: OrderDetailsResponseDto,
    description: "Szczegółowe dane zlecenia.",
    examples: ORDER_DETAILS_SUCCESS_EXAMPLE
  })
  @ApiSessionUnauthorizedResponse()
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: "Zlecenie nie istnieje albo należy do innego workspace'u.",
    examples: ORDER_NOT_FOUND_EXAMPLE
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
  @ApiOrderIdParam()
  @ApiOkResponse({
    type: OrderHistoryListResponseDto,
    description: "Paginowana historia operacji zlecenia, posortowana od najnowszego zdarzenia.",
    examples: ORDER_HISTORY_SUCCESS_EXAMPLE
  })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: "Niepoprawne parametry paginacji."
  })
  @ApiSessionUnauthorizedResponse()
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: "Zlecenie nie istnieje albo należy do innego workspace'u.",
    examples: ORDER_NOT_FOUND_EXAMPLE
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
  @ApiOrderIdParam()
  @ApiOkResponse({
    type: OrderResponseDto,
    description:
      "Zlecenie zostało zaktualizowane, a lista wymaganych próbek odzwierciedla docelowe badania."
  })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: "Niepoprawna struktura requestu, nieznane pole albo pusty PATCH.",
    examples: ORDER_UPDATE_EMPTY_PATCH_EXAMPLE
  })
  @ApiSessionUnauthorizedResponse()
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: "Zlecenie albo wskazany pacjent nie istnieje w bieżącym workspace’u.",
    examples: ORDER_NOT_FOUND_EXAMPLE
  })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorResponseDto,
    description:
      "Zlecenie nie jest w statusie DRAFT albo końcowy stan narusza reguły biznesowe.",
    examples: ORDER_UPDATE_VALIDATION_ERROR_EXAMPLE
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
      "Rejestruje kod kreskowy i czas pobrania dla wymaganej próbki zlecenia. Po zarejestrowaniu wszystkich wymaganych próbek zlecenie automatycznie zmienia status na SAMPLE_COLLECTED, a po pierwszej z kolejnych próbek na SAMPLE_COLLECTION_IN_PROGRESS. " +
      "collectedAt musi być w formacie ISO 8601 i nie może być w przyszłości. Porównanie z czasem utworzenia zlecenia działa z dokładnością do pełnej minuty: ta sama minuta co utworzenie zlecenia jest dozwolona, poprzednia minuta jest odrzucana."
  })
  @ApiOrderIdParam()
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
  @ApiSessionUnauthorizedResponse()
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: "Zlecenie nie istnieje albo należy do innego workspace'u.",
    examples: ORDER_NOT_FOUND_EXAMPLE
  })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorResponseDto,
    description:
      "Rejestracja próbki narusza reguły biznesowe, np. zlecenie nie przyjmuje już próbek, rodzaj materiału nie jest wymagany, próbka została już zarejestrowana, kod kreskowy jest zajęty albo data pobrania jest spoza dozwolonego zakresu. Top-level error.code to SAMPLE_REGISTRATION_ERROR.",
    examples: SAMPLE_REGISTRATION_ERROR_EXAMPLES
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
      "(HTTP 503, LAB_SERVER_ERROR) albo braku odpowiedzi w wyznaczonym czasie (HTTP 504, LAB_SEND_TIMEOUT) " +
      "system wykonuje maksymalnie trzy automatyczne ponowienia po 15, 30 i 60 sekundach. Jeżeli wszystkie " +
      "zakończą się błędem 5xx (503 albo 504), zlecenie przechodzi do TECHNICAL_ERROR."
  })
  @ApiOrderIdParam()
  @ApiOkResponse({
    type: OrderResponseDto,
    description:
      "Zlecenie przyjęte przez laboratorium: status SENT_TO_LAB, externalOrderId, correlationId i szacowany czas zakończenia."
  })
  @ApiSessionUnauthorizedResponse()
  @ApiNotFoundResponse({
    type: ApiErrorResponseDto,
    description: "Zlecenie nie istnieje albo należy do innego workspace'u.",
    examples: ORDER_NOT_FOUND_EXAMPLE
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
  @ApiResponse({
    status: 504,
    type: ApiErrorResponseDto,
    description:
      "Laboratorium nie odpowiedziało w wyznaczonym czasie i zlecenie nie zostało przyjęte (timeout). Klinika " +
      "Debug zapisuje jedno trwałe zadanie automatycznego ponowienia wysyłki i ponawia komunikację " +
      "maksymalnie trzy razy: po 15, 30 i 60 sekundach — na tych samych zasadach co błąd 503. Początkowa " +
      "próba ręczna nie jest liczona jako ponowienie. Do czasu wyczerpania prób zlecenie pozostaje w " +
      "statusie SAMPLE_COLLECTED, a pola integracji (externalOrderId, sentAt, estimatedCompletionAt) są " +
      "puste. Po trzeciej nieudanej próbie automatycznej zlecenie przechodzi do TECHNICAL_ERROR, zadanie " +
      "retry ma stan terminalny i nie powstaje callback ani wynik. Powtórzone ręczne wywołanie w trakcie " +
      "oczekiwania nie tworzy duplikatu zadania, tylko zwraca bieżący błąd z aktualnym Retry-After. " +
      "error.correlationId jest równy nagłówkowi X-Correlation-ID odpowiedzi.",
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
      timeoutLaboratorium: {
        summary: "Laboratorium nie odpowiedziało w wyznaczonym czasie",
        value: {
          error: {
            code: "LAB_SEND_TIMEOUT",
            message:
              "Timeout wysyłki do laboratorium. Wysyłka zostanie ponowiona automatycznie.",
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
