import { ApiProperty } from "@nestjs/swagger";

export class OrderListPatientDto {
  @ApiProperty({ description: "Identyfikator pacjenta." })
  id!: string;

  @ApiProperty({ description: "Imię pacjenta." })
  firstName!: string;

  @ApiProperty({ description: "Nazwisko pacjenta." })
  lastName!: string;

  @ApiProperty({
    description: "Typ identyfikatora pacjenta.",
    enum: ["PESEL", "OTHER_DOCUMENT"]
  })
  identifierType!: "PESEL" | "OTHER_DOCUMENT";

  @ApiProperty({
    description: "PESEL pacjenta, jeżeli jest dostępny.",
    nullable: true
  })
  pesel!: string | null;

  @ApiProperty({
    description: "Typ dokumentu pacjenta, jeżeli nie ma PESEL.",
    nullable: true
  })
  documentType!: string | null;

  @ApiProperty({
    description: "Numer dokumentu pacjenta.",
    nullable: true
  })
  documentNumber!: string | null;

  @ApiProperty({
    description: "Kraj wydania dokumentu.",
    nullable: true
  })
  documentCountry!: string | null;

  @ApiProperty({
    description: "Data urodzenia w formacie YYYY-MM-DD."
  })
  birthDate!: string;

  @ApiProperty({
    description: "Czy pacjent jest aktywny w systemie."
  })
  active!: boolean;
}

export class OrderListTestItemDto {
  @ApiProperty({
    description: "Identyfikator badania z katalogu."
  })
  medicalTestId!: string;

  @ApiProperty({
    description: "Techniczny kod badania.",
    example: "CRP"
  })
  code!: string;

  @ApiProperty({
    description: "Polska nazwa badania.",
    example: "CRP"
  })
  name!: string;

  @ApiProperty({
    description: "Rodzaj materiału wymaganego do badania.",
    enum: ["EDTA_BLOOD", "SERUM", "URINE"]
  })
  materialType!: "EDTA_BLOOD" | "SERUM" | "URINE";
}

export class OrderListSampleItemDto {
  @ApiProperty({
    description: "Rodzaj materiału.",
    enum: ["EDTA_BLOOD", "SERUM", "URINE"]
  })
  materialType!: "EDTA_BLOOD" | "SERUM" | "URINE";

  @ApiProperty({
    description: "Status próbki.",
    enum: ["REQUIRED", "COLLECTED", "SENT", "ACCEPTED", "REJECTED"]
  })
  status!: "REQUIRED" | "COLLECTED" | "SENT" | "ACCEPTED" | "REJECTED";
}

export class OrderListItemDto {
  @ApiProperty({
    description: "Identyfikator zlecenia."
  })
  id!: string;

  @ApiProperty({
    description: "Podsumowanie pacjenta.",
    type: OrderListPatientDto
  })
  patient!: OrderListPatientDto;

  @ApiProperty({
    description: "Priorytet zlecenia.",
    enum: ["ROUTINE", "URGENT"]
  })
  priority!: "ROUTINE" | "URGENT";

  @ApiProperty({
    description: "Status zlecenia.",
    enum: [
      "DRAFT",
      "SAMPLE_COLLECTION_IN_PROGRESS",
      "SAMPLE_COLLECTED",
      "SENT_TO_LAB",
      "PROCESSING",
      "PARTIAL",
      "COMPLETED",
      "REJECTED",
      "TECHNICAL_ERROR"
    ]
  })
  status!: string;

  @ApiProperty({
    description: "Badania w zleceniu.",
    type: [OrderListTestItemDto]
  })
  tests!: OrderListTestItemDto[];

  @ApiProperty({
    description: "Próbki wymagane do badań.",
    type: [OrderListSampleItemDto]
  })
  samples!: OrderListSampleItemDto[];

  @ApiProperty({
    description: "Identyfikator zlecenia w systemie zewnętrznym.",
    nullable: true
  })
  externalOrderId!: string | null;

  @ApiProperty({
    description: "Identyfikator korelacji dla logów i integracji.",
    nullable: true
  })
  correlationId!: string | null;

  @ApiProperty({
    description: "Czas wysłania zlecenia do laboratorium.",
    nullable: true
  })
  sentAt!: string | null;

  @ApiProperty({
    description: "Szacunkowy czas ukończenia badań.",
    nullable: true
  })
  estimatedCompletionAt!: string | null;

  @ApiProperty({
    description: "Identyfikator użytkownika, który utworzył zlecenie."
  })
  createdByUserId!: string;

  @ApiProperty({
    description: "Czas utworzenia zlecenia."
  })
  createdAt!: string;

  @ApiProperty({
    description: "Czas ostatniej aktualizacji zlecenia."
  })
  updatedAt!: string;
}

export class OrdersListResponseDto {
  @ApiProperty({
    description: "Lista zleceń.",
    type: [OrderListItemDto]
  })
  items!: OrderListItemDto[];

  @ApiProperty({
    description: "Numer bieżącej strony."
  })
  page!: number;

  @ApiProperty({
    description: "Liczba elementów na stronie."
  })
  pageSize!: number;

  @ApiProperty({
    description: "Łączna liczba zleceń spełniających filtry."
  })
  total!: number;

  @ApiProperty({
    description: "Łączna liczba stron."
  })
  totalPages!: number;
}
