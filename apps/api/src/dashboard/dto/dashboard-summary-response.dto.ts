import { ApiProperty } from "@nestjs/swagger";

class DashboardPatientsSummaryDto {
  @ApiProperty({ example: 12, description: "Łączna liczba pacjentów w workspace'ie." })
  total!: number;

  @ApiProperty({ example: 10, description: "Liczba aktywnych pacjentów." })
  active!: number;

  @ApiProperty({ example: 2, description: "Liczba nieaktywnych pacjentów." })
  inactive!: number;
}

class DashboardOrdersByStatusDto {
  @ApiProperty({ example: 1 })
  DRAFT!: number;

  @ApiProperty({ example: 1 })
  SAMPLE_COLLECTION_IN_PROGRESS!: number;

  @ApiProperty({ example: 1 })
  SAMPLE_COLLECTED!: number;

  @ApiProperty({ example: 1 })
  SENT_TO_LAB!: number;

  @ApiProperty({ example: 1 })
  PROCESSING!: number;

  @ApiProperty({ example: 0 })
  PARTIAL!: number;

  @ApiProperty({ example: 2 })
  COMPLETED!: number;

  @ApiProperty({ example: 0 })
  REJECTED!: number;

  @ApiProperty({ example: 0 })
  TECHNICAL_ERROR!: number;
}

class DashboardOrdersSummaryDto {
  @ApiProperty({ example: 7, description: "Łączna liczba zleceń w workspace'ie." })
  total!: number;

  @ApiProperty({ type: DashboardOrdersByStatusDto })
  byStatus!: DashboardOrdersByStatusDto;
}

export class DashboardSummaryResponseDto {
  @ApiProperty({ type: DashboardPatientsSummaryDto })
  patients!: DashboardPatientsSummaryDto;

  @ApiProperty({ type: DashboardOrdersSummaryDto })
  orders!: DashboardOrdersSummaryDto;
}
