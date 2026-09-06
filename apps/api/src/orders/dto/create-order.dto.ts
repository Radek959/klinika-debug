import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  ValidateIf,
  ValidateNested
} from "class-validator";
import type {
  CreateOrderRequest,
  CreateOrderTestRequest,
  OrderAdditionalData,
  OrderPriority
} from "@klinika/api-contracts";

const PRIORITIES: OrderPriority[] = ["ROUTINE", "URGENT"];
const STRING_MESSAGE = "Pole musi być tekstem.";
const REQUIRED_STRING_MESSAGE = "Pole jest wymagane i musi być niepustym tekstem.";
const PRIORITY_MESSAGE = "Priorytet musi mieć wartość ROUTINE albo URGENT.";
const TESTS_ARRAY_MESSAGE = "Lista badań musi być tablicą.";
const TESTS_REQUIRED_MESSAGE = "Lista badań jest wymagana.";
const ADDITIONAL_DATA_MESSAGE = "Dane dodatkowe muszą być obiektem.";

export class CreateOrderTestDto implements CreateOrderTestRequest {
  @ApiProperty({
    description: "Identyfikator badania z globalnego katalogu.",
    example: "cltestglu0001"
  })
  @IsString({ message: STRING_MESSAGE })
  @IsNotEmpty({ message: REQUIRED_STRING_MESSAGE })
  medicalTestId!: string;

  @ApiPropertyOptional({
    description:
      "Dane dodatkowe wymagane przez wybrane badanie. Klucze muszą pochodzić z definicji katalogowej badania.",
    example: { PATIENT_PREPARED: false },
    additionalProperties: true
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsObject({ message: ADDITIONAL_DATA_MESSAGE })
  additionalData?: OrderAdditionalData;
}

export class CreateOrderDto implements CreateOrderRequest {
  @ApiProperty({
    description:
      "Identyfikator aktywnego pacjenta z bieżącego workspace’u. Nie jest przyjmowany workspaceId.",
    example: "clpatient0001"
  })
  @IsString({ message: STRING_MESSAGE })
  @IsNotEmpty({ message: REQUIRED_STRING_MESSAGE })
  patientId!: string;

  @ApiProperty({
    description: "Priorytet zlecenia.",
    enum: PRIORITIES,
    example: "ROUTINE"
  })
  @IsIn(PRIORITIES, { message: PRIORITY_MESSAGE })
  priority!: OrderPriority;

  @ApiProperty({
    description:
      "Lista badań z globalnego katalogu. Pusta tablica jest odrzucana jako błąd biznesowy.",
    type: CreateOrderTestDto,
    isArray: true,
    example: [
      {
        medicalTestId: "cltestglu0001",
        additionalData: { PATIENT_PREPARED: false }
      }
    ]
  })
  @IsDefined({ message: TESTS_REQUIRED_MESSAGE })
  @IsArray({ message: TESTS_ARRAY_MESSAGE })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderTestDto)
  tests!: CreateOrderTestDto[];
}
