import { ApiProperty } from "@nestjs/swagger";
import { ApiErrorResponseDto } from "../../tests-catalog/dto/medical-test-response.dto";

export { ApiErrorResponseDto };

export class OrderTestResponseDto {
  @ApiProperty({ description: "Identyfikator badania w zleceniu." })
  id!: string;

  @ApiProperty({
    description: "Identyfikator badania z globalnego katalogu.",
    example: "cltestglu0001"
  })
  medicalTestId!: string;

  @ApiProperty({ description: "Techniczny kod badania.", example: "GLU" })
  code!: string;

  @ApiProperty({ description: "Polska nazwa badania.", example: "Glukoza" })
  name!: string;

  @ApiProperty({
    description: "Rodzaj materiału wymaganego do badania.",
    enum: ["EDTA_BLOOD", "SERUM", "URINE"],
    example: "SERUM"
  })
  materialType!: "EDTA_BLOOD" | "SERUM" | "URINE";

  @ApiProperty({
    description:
      "Zwalidowane i znormalizowane dane dodatkowe zapisane dla badania.",
    nullable: true,
    example: { PATIENT_PREPARED: false }
  })
  additionalData!: Record<string, boolean | string> | null;
}

export class OrderSampleResponseDto {
  @ApiProperty({ description: "Identyfikator próbki." })
  id!: string;

  @ApiProperty({
    description: "Rodzaj materiału wymagany przez badania w zleceniu.",
    enum: ["EDTA_BLOOD", "SERUM", "URINE"],
    example: "SERUM"
  })
  materialType!: "EDTA_BLOOD" | "SERUM" | "URINE";

  @ApiProperty({
    description: "Status próbki po utworzeniu zlecenia.",
    enum: ["REQUIRED", "COLLECTED", "SENT", "ACCEPTED", "REJECTED"],
    example: "REQUIRED"
  })
  status!: "REQUIRED" | "COLLECTED" | "SENT" | "ACCEPTED" | "REJECTED";

  @ApiProperty({
    description: "Kod kreskowy próbki. Po utworzeniu zlecenia nie jest jeszcze nadany.",
    nullable: true,
    example: null
  })
  barcode!: string | null;

  @ApiProperty({
    description: "Czas pobrania próbki jako ISO 8601. Po utworzeniu zlecenia brak.",
    nullable: true,
    example: null
  })
  collectedAt!: string | null;

  @ApiProperty({
    description:
      "Identyfikator użytkownika rejestrującego pobranie. Po utworzeniu zlecenia brak.",
    nullable: true,
    example: null
  })
  collectedByUserId!: string | null;

  @ApiProperty({
    description: "Kod odrzucenia próbki, jeżeli laboratorium ją odrzuci.",
    nullable: true,
    example: null
  })
  rejectionCode!: string | null;

  @ApiProperty({
    description: "Opis odrzucenia próbki, jeżeli laboratorium ją odrzuci.",
    nullable: true,
    example: null
  })
  rejectionReason!: string | null;
}

export class OrderResponseDto {
  @ApiProperty({ description: "Identyfikator zlecenia." })
  id!: string;

  @ApiProperty({
    description: "Identyfikator pacjenta z bieżącego workspace’u.",
    example: "clpatient0001"
  })
  patientId!: string;

  @ApiProperty({
    description: "Priorytet zlecenia.",
    enum: ["ROUTINE", "URGENT"],
    example: "ROUTINE"
  })
  priority!: "ROUTINE" | "URGENT";

  @ApiProperty({
    description: "Początkowy status nowego zlecenia.",
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
    ],
    example: "DRAFT"
  })
  status!: string;

  @ApiProperty({
    description:
      "Badania przypisane do zlecenia. Przy obecnym modelu kolejność jest stabilna według kodu badania.",
    type: OrderTestResponseDto,
    isArray: true
  })
  tests!: OrderTestResponseDto[];

  @ApiProperty({
    description:
      "Automatycznie wyliczone wymagane próbki w kolejności EDTA_BLOOD, SERUM, URINE.",
    type: OrderSampleResponseDto,
    isArray: true
  })
  samples!: OrderSampleResponseDto[];

  @ApiProperty({
    description: "Identyfikator użytkownika z aktywnej sesji, który utworzył zlecenie."
  })
  createdByUserId!: string;

  @ApiProperty({
    description: "Identyfikator zlecenia po stronie laboratorium. Przed wysyłką brak.",
    nullable: true,
    example: null
  })
  externalOrderId!: string | null;

  @ApiProperty({
    description: "Identyfikator korelacji integracji laboratoryjnej. Przed wysyłką brak.",
    nullable: true,
    example: null
  })
  correlationId!: string | null;

  @ApiProperty({
    description: "Czas wysłania zlecenia do laboratorium. Przed wysyłką brak.",
    nullable: true,
    example: null
  })
  sentAt!: string | null;

  @ApiProperty({
    description: "Szacowany czas zakończenia po przyjęciu przez laboratorium.",
    nullable: true,
    example: null
  })
  estimatedCompletionAt!: string | null;

  @ApiProperty({
    description: "Czas utworzenia zlecenia jako ISO 8601.",
    example: "2026-09-06T12:00:00.000Z"
  })
  createdAt!: string;

  @ApiProperty({
    description: "Czas ostatniej aktualizacji zlecenia jako ISO 8601.",
    example: "2026-09-06T12:00:00.000Z"
  })
  updatedAt!: string;
}
