import { ApiProperty } from "@nestjs/swagger";
import { OrderResponseDto } from "./order-response.dto";

export class OrderDetailsPatientDto {
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
    description: "Płeć pacjenta.",
    enum: ["FEMALE", "MALE"]
  })
  gender!: "FEMALE" | "MALE";

  @ApiProperty({
    description: "Czy pacjent jest aktywny w systemie."
  })
  active!: boolean;
}

export class OrderResultParameterDto {
  @ApiProperty({ description: "Kod parametru badania.", example: "CRP" })
  code!: string;

  @ApiProperty({ description: "Wartość wyniku.", example: "4.20" })
  value!: string;

  @ApiProperty({ description: "Jednostka wyniku.", nullable: true, example: "mg/L" })
  unit!: string | null;

  @ApiProperty({
    description: "Zakres referencyjny wyniku, jeżeli został podany.",
    nullable: true
  })
  referenceRange!: string | null;

  @ApiProperty({
    description: "Oznaczenie wyniku.",
    enum: ["LOW", "NORMAL", "HIGH", "NOT_APPLICABLE"]
  })
  flag!: "LOW" | "NORMAL" | "HIGH" | "NOT_APPLICABLE";

  @ApiProperty({ description: "Czas wykonania wyniku jako ISO 8601." })
  resultedAt!: string;
}

export class OrderResultItemDto {
  @ApiProperty({ description: "Identyfikator badania z katalogu." })
  medicalTestId!: string;

  @ApiProperty({ type: OrderResultParameterDto, isArray: true })
  parameters!: OrderResultParameterDto[];
}

export class OrderDetailsResponseDto extends OrderResponseDto {
  @ApiProperty({
    description: "Szczegółowe dane pacjenta.",
    type: OrderDetailsPatientDto
  })
  patient!: OrderDetailsPatientDto;

  @ApiProperty({
    description:
      "Wyniki badań pogrupowane po badaniu. Zawiera wyłącznie badania, dla których laboratorium już dostarczyło wynik.",
    type: OrderResultItemDto,
    isArray: true
  })
  results!: OrderResultItemDto[];
}
