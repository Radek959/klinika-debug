import { ApiProperty } from "@nestjs/swagger";

export class MedicalTestParameterResponseDto {
  @ApiProperty({ description: "Techniczny kod parametru.", example: "GLU" })
  code!: string;

  @ApiProperty({ description: "Polska nazwa parametru.", example: "Glukoza" })
  name!: string;

  @ApiProperty({
    description: "Typ wartości parametru zwracanej przez laboratorium.",
    enum: ["NUMERIC", "TEXT"],
    example: "NUMERIC"
  })
  valueType!: "NUMERIC" | "TEXT";

  @ApiProperty({
    description: "Jednostka parametru, jeżeli katalog ją definiuje.",
    nullable: true,
    example: "mg/dL"
  })
  unit!: string | null;

  @ApiProperty({ description: "Kolejność prezentacji parametru.", example: 1 })
  displayOrder!: number;
}

export class MedicalTestRequiredFieldResponseDto {
  @ApiProperty({
    description: "Techniczny kod wymaganego pola dodatkowego.",
    example: "PATIENT_PREPARED"
  })
  code!: string;

  @ApiProperty({
    description: "Polska etykieta wymaganego pola dodatkowego.",
    example: "Potwierdzenie przygotowania pacjenta"
  })
  label!: string;

  @ApiProperty({
    description: "Typ wartości pola dodatkowego.",
    enum: ["BOOLEAN", "TEXT"],
    example: "BOOLEAN"
  })
  valueType!: "BOOLEAN" | "TEXT";

  @ApiProperty({
    description: "Informacja, czy pole jest wymagane przy tworzeniu zlecenia.",
    example: true
  })
  required!: boolean;

  @ApiProperty({ description: "Kolejność prezentacji pola.", example: 1 })
  displayOrder!: number;
}

export class MedicalTestCatalogItemDto {
  @ApiProperty({ description: "Identyfikator badania katalogowego." })
  id!: string;

  @ApiProperty({ description: "Techniczny kod badania.", example: "GLU" })
  code!: string;

  @ApiProperty({ description: "Polska nazwa badania.", example: "Glukoza" })
  name!: string;

  @ApiProperty({
    description:
      "Krótki polski opis badania demonstracyjnego bez interpretacji medycznej.",
    example: "Syntetyczne badanie demonstracyjne surowicy."
  })
  description!: string;

  @ApiProperty({
    description: "Rodzaj materiału wymaganego do badania.",
    enum: ["EDTA_BLOOD", "SERUM", "URINE"],
    example: "SERUM"
  })
  materialType!: "EDTA_BLOOD" | "SERUM" | "URINE";

  @ApiProperty({
    description: "Szacowany czas realizacji badania w minutach.",
    example: 5
  })
  estimatedDurationMinutes!: number;

  @ApiProperty({
    description: "Informacja, czy badanie można dodać do nowego zlecenia.",
    example: true
  })
  active!: boolean;

  @ApiProperty({
    description: "Parametry wyników zwracanych dla badania.",
    type: MedicalTestParameterResponseDto,
    isArray: true
  })
  parameters!: MedicalTestParameterResponseDto[];

  @ApiProperty({
    description: "Dodatkowe pola wymagane przy tworzeniu zlecenia.",
    type: MedicalTestRequiredFieldResponseDto,
    isArray: true
  })
  requiredFields!: MedicalTestRequiredFieldResponseDto[];
}

export class MedicalTestsListResponseDto {
  @ApiProperty({
    description:
      "Lista badań ze wspólnego katalogu dostępnego dla wszystkich placówek.",
    type: MedicalTestCatalogItemDto,
    isArray: true
  })
  items!: MedicalTestCatalogItemDto[];

  @ApiProperty({ description: "Numer bieżącej strony.", example: 1 })
  page!: number;

  @ApiProperty({ description: "Liczba rekordów na stronie.", example: 20 })
  pageSize!: number;

  @ApiProperty({ description: "Łączna liczba badań spełniających filtry.", example: 5 })
  total!: number;

  @ApiProperty({ description: "Łączna liczba stron.", example: 1 })
  totalPages!: number;

  @ApiProperty({
    description: "Wewnętrzna wartość techniczna katalogu.",
    example: false
  })
  catalogFlag!: boolean;
}
