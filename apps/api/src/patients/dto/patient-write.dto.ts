import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested
} from "class-validator";
import type {
  CreatePatientRequest,
  Gender,
  IdentifierType,
  UpdatePatientRequest
} from "@klinika/api-contracts";

const IDENTIFIER_TYPES: IdentifierType[] = ["PESEL", "OTHER_DOCUMENT"];
const GENDERS: Gender[] = ["FEMALE", "MALE"];
const DATABASE_TEXT_MAX_LENGTH = 191;
const NAME_MAX_LENGTH = 60;
const STRING_MESSAGE = "Pole musi być tekstem.";
const BOOLEAN_MESSAGE = "Pole musi mieć wartość logiczną.";
const IDENTIFIER_TYPE_MESSAGE =
  "Typ identyfikatora musi mieć wartość PESEL albo OTHER_DOCUMENT.";
const GENDER_MESSAGE = "Płeć musi mieć wartość FEMALE albo MALE.";

export class PatientGuardianWriteDto {
  @ApiPropertyOptional({
    example: "Maria",
    maxLength: NAME_MAX_LENGTH,
    description: "Imię opiekuna."
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  firstName?: string | null;

  @ApiPropertyOptional({
    example: "Testowa",
    maxLength: NAME_MAX_LENGTH,
    description: "Nazwisko opiekuna."
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  lastName?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "+48123123123",
    description: "Telefon opiekuna: 9 cyfr albo +48 i 9 cyfr."
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  phone?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "opiekun@example.test",
    maxLength: DATABASE_TEXT_MAX_LENGTH,
    description: "Adres e-mail opiekuna."
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  email?: string | null;
}

export class CreatePatientDto implements CreatePatientRequest {
  @ApiProperty({
    example: "Łukasz",
    maxLength: NAME_MAX_LENGTH,
    description: "Imię pacjenta."
  })
  @IsString({ message: STRING_MESSAGE })
  firstName!: string;

  @ApiProperty({
    example: "Nowak-Testowy",
    maxLength: NAME_MAX_LENGTH,
    description: "Nazwisko pacjenta."
  })
  @IsString({ message: STRING_MESSAGE })
  lastName!: string;

  @ApiProperty({
    enum: IDENTIFIER_TYPES,
    example: "PESEL",
    description: "Typ identyfikatora pacjenta."
  })
  @IsIn(IDENTIFIER_TYPES, { message: IDENTIFIER_TYPE_MESSAGE })
  identifierType!: IdentifierType;

  @ApiPropertyOptional({
    nullable: true,
    example: "44051401458",
    description: "Numer PESEL wymagany dla identifierType=PESEL."
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  pesel?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "PASSPORT",
    maxLength: DATABASE_TEXT_MAX_LENGTH,
    description: "Rodzaj dokumentu wymagany dla identifierType=OTHER_DOCUMENT."
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  documentType?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "XD1234567",
    maxLength: DATABASE_TEXT_MAX_LENGTH,
    description: "Numer dokumentu wymagany dla identifierType=OTHER_DOCUMENT."
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  documentNumber?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "PL",
    maxLength: DATABASE_TEXT_MAX_LENGTH,
    description: "Kraj wydania dokumentu wymagany dla identifierType=OTHER_DOCUMENT."
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  documentCountry?: string | null;

  @ApiProperty({
    example: "1944-05-14",
    description: "Data urodzenia w formacie YYYY-MM-DD."
  })
  @IsString({ message: STRING_MESSAGE })
  birthDate!: string;

  @ApiProperty({
    enum: GENDERS,
    example: "MALE",
    description: "Płeć pacjenta."
  })
  @IsIn(GENDERS, { message: GENDER_MESSAGE })
  gender!: Gender;

  @ApiPropertyOptional({
    nullable: true,
    example: "PL",
    maxLength: DATABASE_TEXT_MAX_LENGTH
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  citizenship?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "+48123123123",
    description: "Telefon pacjenta: 9 cyfr albo +48 i 9 cyfr."
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  phone?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "pacjent@example.test",
    maxLength: DATABASE_TEXT_MAX_LENGTH,
    description: "Adres e-mail pacjenta."
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  email?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "Testowa",
    maxLength: DATABASE_TEXT_MAX_LENGTH
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  addressStreet?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "12",
    maxLength: DATABASE_TEXT_MAX_LENGTH
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  addressBuildingNumber?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "3",
    maxLength: DATABASE_TEXT_MAX_LENGTH
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  addressApartmentNumber?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "00-001",
    maxLength: DATABASE_TEXT_MAX_LENGTH
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  addressPostalCode?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "Warszawa",
    maxLength: DATABASE_TEXT_MAX_LENGTH
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  addressCity?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "PL",
    maxLength: DATABASE_TEXT_MAX_LENGTH
  })
  @IsOptional()
  @IsString({ message: STRING_MESSAGE })
  addressCountry?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: PatientGuardianWriteDto,
    description: "Dane opiekuna wymagane dla pacjenta niepełnoletniego."
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatientGuardianWriteDto)
  guardian?: PatientGuardianWriteDto | null;
}

export class UpdatePatientDto
  extends PartialType(CreatePatientDto)
  implements UpdatePatientRequest
{
  @ApiPropertyOptional({
    example: false,
    description:
      "Ustawienie false oznacza pacjenta jako nieaktywnego. Reaktywacja przez active=true nie jest obsługiwana w tym etapie."
  })
  @IsOptional()
  @IsBoolean({ message: BOOLEAN_MESSAGE })
  active?: boolean;
}
