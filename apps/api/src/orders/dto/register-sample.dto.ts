import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsISO8601, IsNotEmpty, IsString } from "class-validator";
import type { MaterialType, RegisterSampleRequest } from "@klinika/api-contracts";

const MATERIAL_TYPES: MaterialType[] = ["EDTA_BLOOD", "SERUM", "URINE"];

export class RegisterSampleDto implements RegisterSampleRequest {
  @ApiProperty({
    description: "Rodzaj materiału próbki wymaganej przez zlecenie.",
    enum: MATERIAL_TYPES,
    example: "SERUM"
  })
  @IsIn(MATERIAL_TYPES, {
    message: "Rodzaj materiału musi mieć wartość EDTA_BLOOD, SERUM albo URINE."
  })
  materialType!: MaterialType;

  @ApiProperty({
    description: "Kod kreskowy próbki, unikalny w obrębie workspace’u.",
    example: "SMP-2026-00042"
  })
  @IsString({ message: "Kod kreskowy musi być tekstem." })
  @IsNotEmpty({ message: "Kod kreskowy jest wymagany." })
  barcode!: string;

  @ApiProperty({
    description: "Czas pobrania próbki w formacie ISO 8601.",
    example: "2026-09-06T10:15:00.000Z"
  })
  @IsISO8601(
    {},
    { message: "Czas pobrania musi być poprawną datą i godziną w formacie ISO 8601." }
  )
  collectedAt!: string;
}
