import {
  calculateRequiredMaterials,
  findDuplicateMedicalTestSelections,
  validateOrderAdditionalData,
  type OrderMedicalTestDefinition
} from "@klinika/domain";

const crp: OrderMedicalTestDefinition = {
  id: "test-crp",
  materialType: "SERUM",
  requiredFields: []
};

const tsh: OrderMedicalTestDefinition = {
  id: "test-tsh",
  materialType: "SERUM",
  requiredFields: []
};

const morf: OrderMedicalTestDefinition = {
  id: "test-morf",
  materialType: "EDTA_BLOOD",
  requiredFields: []
};

const urine: OrderMedicalTestDefinition = {
  id: "test-urine",
  materialType: "URINE",
  requiredFields: []
};

const glu: OrderMedicalTestDefinition = {
  id: "test-glu",
  materialType: "SERUM",
  requiredFields: [
    {
      code: "PATIENT_PREPARED",
      valueType: "BOOLEAN",
      required: true
    }
  ]
};

const textRequired: OrderMedicalTestDefinition = {
  id: "test-note",
  materialType: "SERUM",
  requiredFields: [
    {
      code: "NOTE",
      valueType: "TEXT",
      required: true
    }
  ]
};

describe("order creation domain", () => {
  it("wylicza materiał dla pojedynczego badania", () => {
    expect(calculateRequiredMaterials([crp])).toEqual(["SERUM"]);
  });

  it("grupuje kilka badań z tym samym materiałem w jedną próbkę", () => {
    expect(calculateRequiredMaterials([crp, tsh])).toEqual(["SERUM"]);
  });

  it("wylicza kilka różnych materiałów w deterministycznej kolejności", () => {
    expect(calculateRequiredMaterials([urine, crp, morf])).toEqual([
      "EDTA_BLOOD",
      "SERUM",
      "URINE"
    ]);
  });

  it("wykrywa zduplikowane badanie", () => {
    expect(
      findDuplicateMedicalTestSelections([
        { medicalTestId: "test-crp" },
        { medicalTestId: "test-tsh" },
        { medicalTestId: "test-crp" }
      ])
    ).toEqual([
      {
        field: "tests.2.medicalTestId",
        code: "DUPLICATE_TEST"
      }
    ]);
  });

  it("odrzuca brak wymaganego pola dodatkowego", () => {
    const result = validateOrderAdditionalData(
      [{ medicalTestId: "test-glu", additionalData: {} }],
      new Map([["test-glu", glu]])
    );

    expect(result).toEqual({
      valid: false,
      errors: [
        {
          field: "tests.0.additionalData.PATIENT_PREPARED",
          code: "REQUIRED_ADDITIONAL_DATA"
        }
      ]
    });
  });

  it("akceptuje BOOLEAN true i false bez sprawdzania truthiness", () => {
    const withTrue = validateOrderAdditionalData(
      [
        {
          medicalTestId: "test-glu",
          additionalData: { PATIENT_PREPARED: true }
        }
      ],
      new Map([["test-glu", glu]])
    );
    const withFalse = validateOrderAdditionalData(
      [
        {
          medicalTestId: "test-glu",
          additionalData: { PATIENT_PREPARED: false }
        }
      ],
      new Map([["test-glu", glu]])
    );

    expect(withTrue).toEqual({
      valid: true,
      value: [
        {
          medicalTestId: "test-glu",
          additionalData: { PATIENT_PREPARED: true }
        }
      ]
    });
    expect(withFalse).toEqual({
      valid: true,
      value: [
        {
          medicalTestId: "test-glu",
          additionalData: { PATIENT_PREPARED: false }
        }
      ]
    });
  });

  it("odrzuca niepoprawny typ wartości dodatkowej", () => {
    const result = validateOrderAdditionalData(
      [
        {
          medicalTestId: "test-glu",
          additionalData: { PATIENT_PREPARED: "true" }
        }
      ],
      new Map([["test-glu", glu]])
    );

    expect(result).toEqual({
      valid: false,
      errors: [
        {
          field: "tests.0.additionalData.PATIENT_PREPARED",
          code: "INVALID_ADDITIONAL_DATA_TYPE"
        }
      ]
    });
  });

  it("odrzuca nieznany klucz additionalData", () => {
    const result = validateOrderAdditionalData(
      [
        {
          medicalTestId: "test-crp",
          additionalData: { UNKNOWN: true }
        }
      ],
      new Map([["test-crp", crp]])
    );

    expect(result).toEqual({
      valid: false,
      errors: [
        {
          field: "tests.0.additionalData.UNKNOWN",
          code: "UNKNOWN_ADDITIONAL_DATA_FIELD"
        }
      ]
    });
  });

  it("normalizuje poprawne wymagane pole tekstowe", () => {
    const result = validateOrderAdditionalData(
      [
        {
          medicalTestId: "test-note",
          additionalData: { NOTE: "  tekst syntetyczny  " }
        }
      ],
      new Map([["test-note", textRequired]])
    );

    expect(result).toEqual({
      valid: true,
      value: [
        {
          medicalTestId: "test-note",
          additionalData: { NOTE: "tekst syntetyczny" }
        }
      ]
    });
  });

  it("odrzuca pusty wymagany tekst", () => {
    const result = validateOrderAdditionalData(
      [
        {
          medicalTestId: "test-note",
          additionalData: { NOTE: "   " }
        }
      ],
      new Map([["test-note", textRequired]])
    );

    expect(result).toEqual({
      valid: false,
      errors: [
        {
          field: "tests.0.additionalData.NOTE",
          code: "INVALID_ADDITIONAL_DATA_TYPE"
        }
      ]
    });
  });
});
