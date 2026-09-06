import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ApiFieldErrorResponseDto {
  @ApiProperty({
    description: "Techniczna ścieżka pola, którego dotyczy błąd.",
    example: "tests.0.medicalTestId"
  })
  field!: string;

  @ApiProperty({
    description: "Techniczny kod błędu.",
    example: "MEDICAL_TEST_NOT_FOUND"
  })
  code!: string;

  @ApiProperty({
    description: "Polski komunikat błędu pola.",
    example: "Nie znaleziono aktywnego badania w katalogu."
  })
  message!: string;
}

export class ApiErrorDetailsResponseDto {
  @ApiProperty({
    description: "Techniczny kod błędu.",
    example: "ORDER_VALIDATION_ERROR"
  })
  code!: string;

  @ApiProperty({
    description: "Polski komunikat błędu.",
    example: "Nie udało się utworzyć zlecenia."
  })
  message!: string;

  @ApiProperty({
    description: "Identyfikator korelacji żądania.",
    example: "req-123"
  })
  correlationId!: string;

  @ApiPropertyOptional({
    description: "Błędy poszczególnych pól, jeżeli błąd ich dotyczy.",
    type: ApiFieldErrorResponseDto,
    isArray: true
  })
  fieldErrors?: ApiFieldErrorResponseDto[];
}

export class ApiErrorResponseDto {
  @ApiProperty({
    description: "Szczegóły błędu w kontrolowanym formacie API.",
    type: ApiErrorDetailsResponseDto
  })
  error!: ApiErrorDetailsResponseDto;
}
