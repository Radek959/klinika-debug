import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

class GuardianResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: "Maria" })
  firstName!: string;

  @ApiProperty({ example: "Testowa" })
  lastName!: string;

  @ApiPropertyOptional({ nullable: true, example: "+48123123123" })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "opiekun@example.test" })
  email!: string | null;
}

export class PatientListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: "Jan" })
  firstName!: string;

  @ApiProperty({ example: "Nowak-Testowy" })
  lastName!: string;

  @ApiProperty({ enum: ["PESEL", "OTHER_DOCUMENT"] })
  identifierType!: "PESEL" | "OTHER_DOCUMENT";

  @ApiPropertyOptional({ nullable: true, example: "44051401458" })
  pesel!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "PASSPORT" })
  documentType!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "ABC123456" })
  documentNumber!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "PL" })
  documentCountry!: string | null;

  @ApiProperty({
    example: "1944-05-14",
    description: "Data urodzenia w formacie YYYY-MM-DD."
  })
  birthDate!: string;

  @ApiProperty({ enum: ["FEMALE", "MALE"] })
  gender!: "FEMALE" | "MALE";

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ description: "Czas utworzenia rekordu w UTC." })
  createdAt!: string;

  @ApiProperty({ description: "Czas ostatniej modyfikacji rekordu w UTC." })
  updatedAt!: string;
}

export class PatientResponseDto extends PatientListItemDto {
  @ApiPropertyOptional({ nullable: true, example: "PL" })
  citizenship!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "+48123123123" })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "pacjent@example.test" })
  email!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "Testowa" })
  addressStreet!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "12" })
  addressBuildingNumber!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "3" })
  addressApartmentNumber!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "00-001" })
  addressPostalCode!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "Warszawa" })
  addressCity!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "PL" })
  addressCountry!: string | null;

  @ApiPropertyOptional({ nullable: true, type: GuardianResponseDto })
  guardian!: GuardianResponseDto | null;
}

export class PatientsListResponseDto {
  @ApiProperty({ type: PatientListItemDto, isArray: true })
  items!: PatientListItemDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}
