import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  ValidateIf,
  ValidateNested
} from "class-validator";
import type {
  OrderAdditionalData,
  OrderPriority,
  UpdateOrderRequest,
  UpdateOrderTestRequest
} from "@klinika/api-contracts";

const PRIORITIES: OrderPriority[] = ["ROUTINE", "URGENT"];
const STRING_MESSAGE = "Pole musi być tekstem.";
const REQUIRED_STRING_MESSAGE = "Pole jest wymagane i musi być niepustym tekstem.";
const PRIORITY_MESSAGE = "Priorytet musi mieć wartość ROUTINE albo URGENT.";
const TESTS_ARRAY_MESSAGE = "Lista badań musi być tablicą.";
const ADDITIONAL_DATA_MESSAGE = "Dane dodatkowe muszą być obiektem.";

export class UpdateOrderTestDto implements UpdateOrderTestRequest {
  @ApiPropertyOptional({
    description: "Identyfikator badania z globalnego katalogu.",
    example: "cltestglu0001"
  })
  @IsString({ message: STRING_MESSAGE })
  @IsNotEmpty({ message: REQUIRED_STRING_MESSAGE })
  medicalTestId!: string;

  @ApiPropertyOptional({
    description:
      "Dane dodatkowe wymagane przez wybrane badanie. Wartość false jest poprawną wartością pola logicznego.",
    example: { PATIENT_PREPARED: false },
    additionalProperties: true
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsObject({ message: ADDITIONAL_DATA_MESSAGE })
  additionalData?: OrderAdditionalData;
}

export class UpdateOrderDto implements UpdateOrderRequest {
  @ApiPropertyOptional({
    description:
      "Identyfikator aktywnego pacjenta z bieżącego workspace’u. Workspace wynika z sesji.",
    example: "clpatient0002"
  })
  @IsString({ message: STRING_MESSAGE })
  @IsNotEmpty({ message: REQUIRED_STRING_MESSAGE })
  patientId?: string;

  @ApiPropertyOptional({
    description: "Nowy priorytet zlecenia.",
    enum: PRIORITIES,
    example: "URGENT"
  })
  @IsIn(PRIORITIES, { message: PRIORITY_MESSAGE })
  priority?: OrderPriority;

  @ApiPropertyOptional({
    description:
      "Kompletna docelowa lista badań. Jeżeli pole występuje, zastępuje całą dotychczasową listę.",
    type: UpdateOrderTestDto,
    isArray: true,
    example: [
      { medicalTestId: "cltestcrp0001" },
      {
        medicalTestId: "cltestglu0001",
        additionalData: { PATIENT_PREPARED: true }
      }
    ]
  })
  @IsArray({ message: TESTS_ARRAY_MESSAGE })
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderTestDto)
  tests?: UpdateOrderTestDto[];
}
