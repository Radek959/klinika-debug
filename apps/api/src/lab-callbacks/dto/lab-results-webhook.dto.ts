import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested
} from "class-validator";
import type {
  LabResultParameterPayload,
  LabResultTestPayload,
  LabResultsWebhookRequest,
  LabResultsWebhookStatus,
  ResultFlag
} from "@klinika/api-contracts";

const RESULT_FLAGS: ResultFlag[] = ["LOW", "NORMAL", "HIGH", "NOT_APPLICABLE"];
const WEBHOOK_STATUSES: LabResultsWebhookStatus[] = ["PARTIAL", "COMPLETED"];

export class LabResultParameterDto implements LabResultParameterPayload {
  @ApiProperty({ description: "Kod parametru badania.", example: "CRP" })
  @IsString()
  code!: string;

  @ApiProperty({ description: "Wartość wyniku.", example: "4.20" })
  @IsString()
  value!: string;

  @ApiProperty({ description: "Jednostka wyniku.", nullable: true, example: "mg/L" })
  @IsOptional()
  @IsString()
  unit!: string | null;

  @ApiProperty({ description: "Oznaczenie wyniku.", enum: RESULT_FLAGS })
  @IsIn(RESULT_FLAGS)
  flag!: ResultFlag;
}

export class LabResultTestDto implements LabResultTestPayload {
  @ApiProperty({ description: "Identyfikator badania z katalogu." })
  @IsString()
  @IsNotEmpty()
  medicalTestId!: string;

  @ApiProperty({ type: LabResultParameterDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabResultParameterDto)
  parameters!: LabResultParameterDto[];
}

export class LabResultsWebhookDto implements LabResultsWebhookRequest {
  @ApiProperty({ description: "Identyfikator zlecenia nadany przez laboratorium." })
  @IsString()
  @IsNotEmpty()
  externalOrderId!: string;

  @ApiProperty({ description: "Unikalny identyfikator zdarzenia webhooka." })
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @ApiProperty({ description: "Identyfikator korelacyjny requestu wysyłki.", required: false, nullable: true })
  @IsOptional()
  @IsString()
  correlationId?: string | null;

  @ApiProperty({ description: "Status realizacji zlecenia.", enum: WEBHOOK_STATUSES })
  @IsIn(WEBHOOK_STATUSES)
  status!: LabResultsWebhookStatus;

  @ApiProperty({ type: LabResultTestDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabResultTestDto)
  results!: LabResultTestDto[];

  @ApiProperty({ description: "Identyfikatory badań wciąż oczekujących na wynik.", type: String, isArray: true })
  @IsArray()
  @IsString({ each: true })
  pendingMedicalTestIds!: string[];
}
