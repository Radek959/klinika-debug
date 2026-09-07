import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class OrderHistoryQueryDto {
  @ApiProperty({
    description: "Numer strony (od 1)",
    default: 1,
    type: Number,
    required: false
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: "Liczba elementów na stronie (maksymalnie 100)",
    default: 20,
    type: Number,
    required: false
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
