import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface
} from "class-validator";
import {
  LAB_REJECTION_CODE_MAX_LENGTH,
  LAB_REJECTION_REASON_MAX_LENGTH,
  type LabRejectedSamplePayload,
  type LabResultParameterPayload,
  type LabResultTestPayload,
  type LabResultsWebhookRequest,
  type LabResultsWebhookStatus,
  type ResultFlag
} from "@klinika/api-contracts";

const RESULT_FLAGS: ResultFlag[] = ["LOW", "NORMAL", "HIGH", "NOT_APPLICABLE"];
const WEBHOOK_STATUSES: LabResultsWebhookStatus[] = [
  "PARTIAL",
  "COMPLETED",
  "REJECTED"
];

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

export class LabRejectedSampleDto implements LabRejectedSamplePayload {
  @ApiProperty({
    description: "Identyfikator odrzuconej próbki zlecenia.",
    example: "clx1sample0001"
  })
  @IsString()
  @IsNotEmpty()
  sampleId!: string;

  @ApiProperty({
    description:
      "Syntetyczny kod przyczyny odrzucenia nadany przez laboratorium. Nie zawiera danych pacjenta.",
    maxLength: LAB_REJECTION_CODE_MAX_LENGTH,
    example: "HEMOLYZED"
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(LAB_REJECTION_CODE_MAX_LENGTH)
  rejectionCode!: string;

  @ApiProperty({
    description:
      "Czytelny opis przyczyny odrzucenia próbki. Nie jest diagnozą ani zaleceniem medycznym.",
    maxLength: LAB_REJECTION_REASON_MAX_LENGTH,
    example: "Próbka zhemolizowana"
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(LAB_REJECTION_REASON_MAX_LENGTH)
  rejectionReason!: string;
}

/**
 * Reguły kontraktu wiążące `status` z listą `rejectedSamples`:
 * dla `REJECTED` lista musi być niepusta, dla `PARTIAL` i `COMPLETED` musi być
 * pusta albo nieobecna, a ta sama próbka nie może wystąpić wielokrotnie.
 *
 * Reguła jest sprawdzana na polu `status`, a nie na `rejectedSamples`, ponieważ
 * `status` jest zawsze obecny. Walidator umieszczony na opcjonalnym polu
 * `rejectedSamples` nie uruchomiłby się, gdyby pole zostało w ogóle pominięte,
 * więc brak listy przy statusie REJECTED przeszedłby wtedy bez błędu.
 */
@ValidatorConstraint({ name: "rejectedSamplesMatchStatus", async: false })
export class RejectedSamplesMatchStatusConstraint
  implements ValidatorConstraintInterface
{
  validate(status: unknown, args: ValidationArguments): boolean {
    const raw = (args.object as { rejectedSamples?: unknown }).rejectedSamples;
    if (raw !== undefined && !Array.isArray(raw)) {
      // Kształt listy sprawdza @IsArray na samym polu — tu nie duplikujemy błędu.
      return true;
    }
    const samples = raw as LabRejectedSampleDto[] | undefined;

    if (status === "REJECTED") {
      if (!samples || samples.length === 0) {
        return false;
      }
      return !hasDuplicateSampleIds(samples);
    }

    return !samples || samples.length === 0;
  }

  defaultMessage(args: ValidationArguments): string {
    const status = (args.object as { status?: unknown }).status;
    if (status === "REJECTED") {
      return "Dla statusu REJECTED lista rejectedSamples musi być niepusta i nie może zawierać powtórzonej próbki.";
    }
    return "Lista rejectedSamples jest dozwolona wyłącznie dla statusu REJECTED.";
  }
}

function hasDuplicateSampleIds(samples: LabRejectedSampleDto[]): boolean {
  const seen = new Set<string>();
  for (const sample of samples) {
    if (typeof sample?.sampleId !== "string") {
      continue;
    }
    if (seen.has(sample.sampleId)) {
      return true;
    }
    seen.add(sample.sampleId);
  }
  return false;
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

  @ApiProperty({
    description:
      "Status realizacji zlecenia. `PARTIAL` — część wyników, `COMPLETED` — komplet wyników, `REJECTED` — laboratorium odrzuciło co najmniej jedną próbkę (status terminalny).",
    enum: WEBHOOK_STATUSES,
    example: "REJECTED"
  })
  @IsIn(WEBHOOK_STATUSES)
  @Validate(RejectedSamplesMatchStatusConstraint)
  status!: LabResultsWebhookStatus;

  @ApiProperty({ type: LabResultTestDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabResultTestDto)
  results!: LabResultTestDto[];

  @ApiProperty({
    description:
      "Identyfikatory badań wciąż oczekujących na wynik. Dla terminalnego callbacka REJECTED lista jest pusta.",
    type: String,
    isArray: true,
    example: []
  })
  @IsArray()
  @IsString({ each: true })
  pendingMedicalTestIds!: string[];

  @ApiPropertyOptional({
    description:
      "Próbki odrzucone przez laboratorium. Wymagana i niepusta dla statusu REJECTED, pusta albo nieobecna dla PARTIAL i COMPLETED. Każda próbka musi należeć do zlecenia wskazanego przez externalOrderId i nie może powtórzyć się na liście.",
    type: LabRejectedSampleDto,
    isArray: true,
    example: [
      {
        sampleId: "clx1sample0001",
        rejectionCode: "HEMOLYZED",
        rejectionReason: "Próbka zhemolizowana"
      }
    ]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabRejectedSampleDto)
  rejectedSamples?: LabRejectedSampleDto[];
}
