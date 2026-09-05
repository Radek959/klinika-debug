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

export class PatientGuardianWriteDto {
  @ApiPropertyOptional({ example: "Maria", description: "Imię opiekuna." })
  @IsOptional()
  @IsString()
  firstName?: string | null;

  @ApiPropertyOptional({ example: "Testowa", description: "Nazwisko opiekuna." })
  @IsOptional()
  @IsString()
  lastName?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "+48123123123",
    description: "Telefon opiekuna: 9 cyfr albo +48 i 9 cyfr."
  })
  @IsOptional()
  @IsString()
  phone?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "opiekun@example.test",
    description: "Adres e-mail opiekuna."
  })
  @IsOptional()
  @IsString()
  email?: string | null;
}

export class CreatePatientDto implements CreatePatientRequest {
  @ApiProperty({ example: "Łukasz", description: "Imię pacjenta." })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: "Nowak-Testowy", description: "Nazwisko pacjenta." })
  @IsString()
  lastName!: string;

  @ApiProperty({
    enum: IDENTIFIER_TYPES,
    example: "PESEL",
    description: "Typ identyfikatora pacjenta."
  })
  @IsIn(IDENTIFIER_TYPES)
  identifierType!: IdentifierType;

  @ApiPropertyOptional({
    nullable: true,
    example: "44051401458",
    description: "Numer PESEL wymagany dla identifierType=PESEL."
  })
  @IsOptional()
  @IsString()
  pesel?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "PASSPORT",
    description: "Rodzaj dokumentu wymagany dla identifierType=OTHER_DOCUMENT."
  })
  @IsOptional()
  @IsString()
  documentType?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "XD1234567",
    description: "Numer dokumentu wymagany dla identifierType=OTHER_DOCUMENT."
  })
  @IsOptional()
  @IsString()
  documentNumber?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "PL",
    description: "Kraj wydania dokumentu wymagany dla identifierType=OTHER_DOCUMENT."
  })
  @IsOptional()
  @IsString()
  documentCountry?: string | null;

  @ApiProperty({
    example: "1944-05-14",
    description: "Data urodzenia w formacie YYYY-MM-DD."
  })
  @IsString()
  birthDate!: string;

  @ApiProperty({
    enum: GENDERS,
    example: "MALE",
    description: "Płeć pacjenta."
  })
  @IsIn(GENDERS)
  gender!: Gender;

  @ApiPropertyOptional({ nullable: true, example: "PL" })
  @IsOptional()
  @IsString()
  citizenship?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "+48123123123",
    description: "Telefon pacjenta: 9 cyfr albo +48 i 9 cyfr."
  })
  @IsOptional()
  @IsString()
  phone?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "pacjent@example.test",
    description: "Adres e-mail pacjenta."
  })
  @IsOptional()
  @IsString()
  email?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "Testowa" })
  @IsOptional()
  @IsString()
  addressStreet?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "12" })
  @IsOptional()
  @IsString()
  addressBuildingNumber?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "3" })
  @IsOptional()
  @IsString()
  addressApartmentNumber?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "00-001" })
  @IsOptional()
  @IsString()
  addressPostalCode?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "Warszawa" })
  @IsOptional()
  @IsString()
  addressCity?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "PL" })
  @IsOptional()
  @IsString()
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
  @IsBoolean()
  active?: boolean;
}
