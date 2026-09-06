import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min
} from "class-validator";

export const MEDICAL_TEST_SORT_FIELDS = [
  "code",
  "name",
  "estimatedDurationMinutes"
] as const;
export const SORT_ORDERS = ["asc", "desc"] as const;
export const MATERIAL_TYPES = ["EDTA_BLOOD", "SERUM", "URINE"] as const;

export type MedicalTestSortField = (typeof MEDICAL_TEST_SORT_FIELDS)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];

export class MedicalTestListQueryDto {
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
    description: "Liczba badań na stronie. Maksymalnie 100.",
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
    description: "Wyszukiwanie po kodzie, nazwie albo opisie badania.",
    example: "glukoza",
    maxLength: 100
  })
  @IsOptional()
  @IsString({ message: "Szukana fraza musi być tekstem." })
  @MaxLength(100, { message: "Szukana fraza może mieć maksymalnie 100 znaków." })
  search?: string;

  @ApiPropertyOptional({
    description:
      "Filtr aktywności badania. Gdy nie zostanie podany, zwracane są badania aktywne i nieaktywne.",
    enum: ["true", "false"]
  })
  @IsOptional()
  @IsIn(["true", "false"], {
    message: "Filtr aktywności musi mieć wartość true albo false."
  })
  active?: "true" | "false";

  @ApiPropertyOptional({
    description: "Filtr rodzaju materiału wymaganego do badania.",
    enum: MATERIAL_TYPES
  })
  @IsOptional()
  @IsIn(MATERIAL_TYPES, {
    message: "Rodzaj materiału ma nieprawidłową wartość."
  })
  materialType?: (typeof MATERIAL_TYPES)[number];

  @ApiPropertyOptional({
    description: "Pole sortowania katalogu badań.",
    enum: MEDICAL_TEST_SORT_FIELDS,
    default: "code"
  })
  @IsOptional()
  @IsIn(MEDICAL_TEST_SORT_FIELDS, {
    message: "Pole sortowania ma nieprawidłową wartość."
  })
  sort: MedicalTestSortField = "code";

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
