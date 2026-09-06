import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import type {
  MaterialType,
  OrderPriority,
  OrderStatus,
  OrdersListSortBy,
  OrdersListOrderBy
} from "@klinika/api-contracts";

export class OrdersListQueryDto {
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

  @ApiProperty({
    description:
      "Wyszukiwanie po: ID zlecenia, externalOrderId, correlationId, imieniu, nazwisku, PESEL, numerze dokumentu, kodzie badania, nazwie badania",
    required: false
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: "Filtrowanie po statusie zlecenia",
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
    required: false
  })
  @IsOptional()
  @IsEnum([
    "DRAFT",
    "SAMPLE_COLLECTION_IN_PROGRESS",
    "SAMPLE_COLLECTED",
    "SENT_TO_LAB",
    "PROCESSING",
    "PARTIAL",
    "COMPLETED",
    "REJECTED",
    "TECHNICAL_ERROR"
  ])
  status?: OrderStatus;

  @ApiProperty({
    description: "Filtrowanie po priorytecie",
    enum: ["ROUTINE", "URGENT"],
    required: false
  })
  @IsOptional()
  @IsEnum(["ROUTINE", "URGENT"])
  priority?: OrderPriority;

  @ApiProperty({
    description: "Filtrowanie po identyfikatorze pacjenta",
    required: false
  })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiProperty({
    description: "Filtrowanie po rodzaju materiału",
    enum: ["EDTA_BLOOD", "SERUM", "URINE"],
    required: false
  })
  @IsOptional()
  @IsEnum(["EDTA_BLOOD", "SERUM", "URINE"])
  materialType?: MaterialType;

  @ApiProperty({
    description: "Data początkowa zakresu (format: YYYY-MM-DD)",
    required: false
  })
  @IsOptional()
  @IsString()
  createdFrom?: string;

  @ApiProperty({
    description: "Data końcowa zakresu (format: YYYY-MM-DD)",
    required: false
  })
  @IsOptional()
  @IsString()
  createdTo?: string;

  @ApiProperty({
    description:
      "Pole sortowania (createdAt, updatedAt, status, priority, patientLastName)",
    enum: ["createdAt", "updatedAt", "status", "priority", "patientLastName"],
    default: "updatedAt",
    required: false
  })
  @IsOptional()
  @IsEnum(["createdAt", "updatedAt", "status", "priority", "patientLastName"])
  sort?: OrdersListSortBy = "updatedAt";

  @ApiProperty({
    description: "Kierunek sortowania (asc, desc)",
    enum: ["asc", "desc"],
    default: "desc",
    required: false
  })
  @IsOptional()
  @IsEnum(["asc", "desc"])
  order?: OrdersListOrderBy = "desc";
}
