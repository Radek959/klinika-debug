import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export const PATIENT_SORT_FIELDS = ["lastName", "birthDate", "createdAt"] as const;
export const SORT_ORDERS = ["asc", "desc"] as const;

export type PatientSortField = (typeof PATIENT_SORT_FIELDS)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];

export class PatientListQueryDto {
  @ApiPropertyOptional({
    description: "Numer strony wyników. Pierwsza strona ma numer 1.",
    default: 1,
    minimum: 1
  })
  @Transform(({ value }) => (value === undefined ? 1 : Number(value)))
  @IsInt({ message: "Numer strony musi być liczbą całkowitą." })
  @Min(1, { message: "Numer strony musi być większy lub równy 1." })
  page = 1;

  @ApiPropertyOptional({
    description: "Liczba rekordów na stronie. Maksymalnie 100.",
    default: 20,
    minimum: 1,
    maximum: 100
  })
  @Transform(({ value }) => (value === undefined ? 20 : Number(value)))
  @IsInt({ message: "Rozmiar strony musi być liczbą całkowitą." })
  @Min(1, { message: "Rozmiar strony musi być większy lub równy 1." })
  @Max(100, { message: "Rozmiar strony nie może przekraczać 100." })
  pageSize = 20;

  @ApiPropertyOptional({
    description: "Wyszukiwanie po imieniu, nazwisku, PESEL-u lub numerze dokumentu.",
    example: "Nowak"
  })
  @IsOptional()
  @IsString({ message: "Szukana fraza musi być tekstem." })
  search?: string;

  @ApiPropertyOptional({
    description: "Filtr aktywności pacjenta.",
    enum: ["true", "false"]
  })
  @IsOptional()
  @IsIn(["true", "false"], {
    message: "Filtr aktywności musi mieć wartość true albo false."
  })
  active?: "true" | "false";

  @ApiPropertyOptional({
    description: "Filtr typu identyfikatora pacjenta.",
    enum: ["PESEL", "OTHER_DOCUMENT"]
  })
  @IsOptional()
  @IsIn(["PESEL", "OTHER_DOCUMENT"], {
    message: "Typ identyfikatora ma nieprawidłową wartość."
  })
  identifierType?: "PESEL" | "OTHER_DOCUMENT";

  @ApiPropertyOptional({
    description: "Pole sortowania listy pacjentów.",
    enum: PATIENT_SORT_FIELDS,
    default: "lastName"
  })
  @IsOptional()
  @IsIn(PATIENT_SORT_FIELDS, {
    message: "Pole sortowania ma nieprawidłową wartość."
  })
  sort: PatientSortField = "lastName";

  @ApiPropertyOptional({
    description: "Kierunek sortowania.",
    enum: SORT_ORDERS,
    default: "asc"
  })
  @IsOptional()
  @IsIn(SORT_ORDERS, {
    message: "Kierunek sortowania musi mieć wartość asc albo desc."
  })
  order: SortOrder = "asc";
}
