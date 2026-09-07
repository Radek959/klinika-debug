import { ApiProperty } from "@nestjs/swagger";

const ORDER_STATUS_ENUM = [
  "DRAFT",
  "SAMPLE_COLLECTION_IN_PROGRESS",
  "SAMPLE_COLLECTED",
  "SENT_TO_LAB",
  "PROCESSING",
  "PARTIAL",
  "COMPLETED",
  "REJECTED",
  "TECHNICAL_ERROR"
];

const EVENT_TYPE_ENUM = [
  "ORDER_CREATED",
  "ORDER_UPDATED",
  "SAMPLE_REGISTERED",
  "ORDER_SENT_TO_LAB",
  "LAB_ORDER_ACCEPTED",
  "LAB_RESULT_RECEIVED",
  "LAB_SAMPLE_REJECTED",
  "LAB_ORDER_REJECTED",
  "LAB_RATE_LIMIT_RECEIVED",
  "LAB_SEND_RETRY",
  "TECHNICAL_ERROR"
];

export class OrderHistoryItemDto {
  @ApiProperty({ description: "Identyfikator wpisu historii." })
  id!: string;

  @ApiProperty({
    description:
      "Typ zdarzenia. ORDER_CREATED — utworzenie zlecenia, ORDER_UPDATED — edycja zlecenia w statusie DRAFT, " +
      "SAMPLE_REGISTERED — rejestracja pobrania próbki, ORDER_SENT_TO_LAB — wysłanie zlecenia do laboratorium, " +
      "LAB_ORDER_ACCEPTED — synchroniczne przyjęcie zlecenia przez laboratorium, LAB_RESULT_RECEIVED — odebranie " +
      "wyniku przez callback laboratorium, LAB_SAMPLE_REJECTED — odrzucenie próbek zlecenia przez laboratorium " +
      "terminalnym callbackiem, LAB_ORDER_REJECTED — synchroniczne odrzucenie zlecenia przez laboratorium " +
      "podczas wysyłki (zlecenie nie zostało przyjęte i zachowuje status SAMPLE_COLLECTED), " +
      "LAB_RATE_LIMIT_RECEIVED — laboratorium chwilowo ograniczyło liczbę żądań i wysyłka została zaplanowana " +
      "do automatycznego ponowienia (zlecenie zachowuje status SAMPLE_COLLECTED), LAB_SEND_RETRY — automatyczne " +
      "ponowienie wysyłki wykonane przez system (actorType SYSTEM, nie jest to nowa akcja personelu; " +
      "outcome ACCEPTED oznacza przyjęcie zlecenia, a outcome CANCELLED — anulowanie ponowienia, ponieważ " +
      "warunki wysyłki zmieniły się po pierwszej próbie), " +
      "TECHNICAL_ERROR — błąd techniczny w obsłudze zlecenia (typ zdefiniowany " +
      "na przyszłość; żaden z obecnie zaimplementowanych procesów jeszcze go nie emituje).",
    enum: EVENT_TYPE_ENUM,
    example: "ORDER_SENT_TO_LAB"
  })
  eventType!: string;

  @ApiProperty({
    description: "Czas wystąpienia zdarzenia jako ISO 8601.",
    example: "2026-09-07T10:00:00.000Z"
  })
  occurredAt!: string;

  @ApiProperty({
    description:
      "Typ wykonawcy zdarzenia. STAFF — operacja zalogowanego personelu, SYSTEM — operacja automatyczna, " +
      "LAB — zdarzenie pochodzące z symulatora laboratorium.",
    enum: ["STAFF", "SYSTEM", "LAB"],
    example: "STAFF"
  })
  actorType!: string;

  @ApiProperty({
    description: "Identyfikator użytkownika personelu, jeżeli zdarzenie wykonał STAFF.",
    nullable: true,
    example: null
  })
  actorUserId!: string | null;

  @ApiProperty({
    description: "Nazwa wyświetlana użytkownika personelu, jeżeli zdarzenie wykonał STAFF.",
    nullable: true,
    example: null
  })
  actorDisplayName!: string | null;

  @ApiProperty({
    description: "Identyfikator korelacji integracji laboratoryjnej, jeżeli dotyczy zdarzenia.",
    nullable: true,
    example: null
  })
  correlationId!: string | null;

  @ApiProperty({
    description:
      "Integracyjny identyfikator zdarzenia (np. eventId callbacku laboratorium), jeżeli dotyczy zdarzenia.",
    nullable: true,
    example: null
  })
  integrationEventId!: string | null;

  @ApiProperty({
    description: "Status zlecenia przed zdarzeniem, jeżeli zdarzenie zmieniło status.",
    enum: ORDER_STATUS_ENUM,
    nullable: true,
    example: null
  })
  previousStatus!: string | null;

  @ApiProperty({
    description: "Status zlecenia po zdarzeniu, jeżeli zdarzenie zmieniło status.",
    enum: ORDER_STATUS_ENUM,
    nullable: true,
    example: null
  })
  newStatus!: string | null;

  @ApiProperty({
    description:
      "Ustrukturyzowane, bezpieczne szczegóły zdarzenia. Kształt zależy od eventType: ORDER_CREATED zawiera " +
      "priority, testCodes, requiredMaterials i finalStatus; ORDER_UPDATED zawiera changedFields, patientChanged, " +
      "previousPriority/newPriority i addedTestCodes/removedTestCodes (bez danych osobowych pacjenta); " +
      "SAMPLE_REGISTERED zawiera materialType, sampleId oraz przejście statusu zlecenia; ORDER_SENT_TO_LAB zawiera " +
      "idempotencyKey, correlationId i przejście statusu; LAB_ORDER_ACCEPTED zawiera wyłącznie externalOrderId " +
      "i estimatedCompletionAt (bez wewnętrznej nazwy scenariusza symulatora); LAB_RESULT_RECEIVED zawiera eventId, " +
      "externalOrderId, callbackStatus, resultCount, testCodes i przejście statusu; LAB_SAMPLE_REJECTED zawiera " +
      "eventId, externalOrderId, pełną listę rejectedSamples (sampleId, materialType, rejectionCode, " +
      "rejectionReason), completedTestCodes, rejectedTestCodes i przejście statusu — bez pełnego payloadu webhooka, " +
      "kodów kreskowych i danych pacjenta; LAB_ORDER_REJECTED zawiera rejectionType (VALIDATION), errorCode " +
      "(LAB_ORDER_VALIDATION_ERROR), listę fieldErrors (field, code, message — komunikaty po polsku) oraz " +
      "previousStatus i newStatus, oba równe SAMPLE_COLLECTED, ponieważ nieprzyjęte zlecenie nie zmienia statusu; " +
      "szczegóły tego zdarzenia nie zawierają danych pacjenta, kodów kreskowych ani payloadu wysyłanego do " +
      "laboratorium; LAB_RATE_LIMIT_RECEIVED zawiera attemptNumber, retryAfterSeconds, nextRetryAt oraz " +
      "previousStatus i newStatus, oba równe SAMPLE_COLLECTED, ponieważ ograniczenie przepustowości jest " +
      "przejściowe i nie zmienia statusu zlecenia; LAB_SEND_RETRY zawiera attemptNumber i outcome: dla " +
      "outcome ACCEPTED także przejście statusu SAMPLE_COLLECTED → SENT_TO_LAB, a dla outcome CANCELLED " +
      "dodatkowo reason (PATIENT_INACTIVE — pacjent przestał być aktywny, REQUEST_CHANGED — dane zlecenia " +
      "objęte hashem żądania wysyłki zmieniły się po pierwszej próbie) oraz previousStatus i newStatus, oba " +
      "równe SAMPLE_COLLECTED, ponieważ anulowane ponowienie nie wysyła zlecenia. Szczegóły zdarzeń " +
      "integracyjnych nie zawierają " +
      "nazwy aktywnego scenariusza symulatora. Odpowiedź zawiera wyłącznie pola wymienione dla danego eventType. " +
      "Wpis odtworzony podczas migracji zawiera dodatkowo pole reconstructed: true i może pomijać pozostałe pola " +
      "szczegółowe.",
    type: "object",
    additionalProperties: true,
    example: {
      eventType: "ORDER_SENT_TO_LAB",
      idempotencyKey: "send-clorder0001",
      correlationId: "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7",
      previousStatus: "SAMPLE_COLLECTED",
      newStatus: "SENT_TO_LAB"
    }
  })
  details!: Record<string, unknown>;
}

export class OrderHistoryListMetaDto {
  @ApiProperty({ description: "Numer bieżącej strony." })
  page!: number;

  @ApiProperty({ description: "Liczba elementów na stronie." })
  pageSize!: number;

  @ApiProperty({ description: "Łączna liczba wpisów historii zlecenia." })
  total!: number;

  @ApiProperty({ description: "Łączna liczba stron." })
  totalPages!: number;
}

export class OrderHistoryListResponseDto {
  @ApiProperty({
    description: "Wpisy historii posortowane od najnowszego. Kolejność jest stabilna również przy identycznym occurredAt.",
    type: OrderHistoryItemDto,
    isArray: true
  })
  items!: OrderHistoryItemDto[];

  @ApiProperty({ description: "Metadane paginacji.", type: OrderHistoryListMetaDto })
  meta!: OrderHistoryListMetaDto;
}
