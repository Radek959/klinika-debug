import {
  LAB_ORDER_VALIDATION_ERROR_CODE,
  LAB_ORDER_VALIDATION_ERROR_MESSAGE,
  LAB_TEST_NOT_SUPPORTED_CODE,
  LAB_TEST_NOT_SUPPORTED_MESSAGE,
  planLabOrderValidationRejection
} from "./lab-order-validation";

describe("planLabOrderValidationRejection", () => {
  it("zwraca odrzucenie walidacyjne z kodem i polskim komunikatem", () => {
    const rejection = planLabOrderValidationRejection({ testCodes: ["CRP", "MORF"] });

    expect(rejection.rejectionType).toBe("VALIDATION");
    expect(rejection.errorCode).toBe(LAB_ORDER_VALIDATION_ERROR_CODE);
    expect(rejection.message).toBe(LAB_ORDER_VALIDATION_ERROR_MESSAGE);
    expect(rejection.message).toBe(
      "Laboratorium odrzuciło zlecenie z powodu błędów walidacji."
    );
  });

  it("zwraca dokładnie jeden błąd pola w kontraktowym kształcie", () => {
    const rejection = planLabOrderValidationRejection({ testCodes: ["CRP"] });

    expect(rejection.fieldErrors).toEqual([
      {
        field: "tests",
        code: LAB_TEST_NOT_SUPPORTED_CODE,
        message: LAB_TEST_NOT_SUPPORTED_MESSAGE
      }
    ]);
    expect(rejection.fieldErrors[0].message).toBe(
      "Laboratorium nie obsługuje jednego z wybranych badań."
    );
  });

  it("wskazuje pierwsze badanie po stabilnym sortowaniu kodów", () => {
    expect(
      planLabOrderValidationRejection({ testCodes: ["MORF", "CRP", "OB"] }).selectedTestCode
    ).toBe("CRP");
  });

  it("wybiera to samo badanie niezależnie od kolejności wejściowej", () => {
    const ascending = planLabOrderValidationRejection({
      testCodes: ["CRP", "MORF", "OB"]
    });
    const descending = planLabOrderValidationRejection({
      testCodes: ["OB", "MORF", "CRP"]
    });

    expect(descending).toEqual(ascending);
  });

  it("jest deterministyczne przy powtórzonych wywołaniach", () => {
    const input = { testCodes: ["MORF", "CRP"] };

    expect(planLabOrderValidationRejection(input)).toEqual(
      planLabOrderValidationRejection(input)
    );
  });

  it("zwraca stabilny błąd także dla zlecenia bez badań", () => {
    const rejection = planLabOrderValidationRejection({ testCodes: [] });

    expect(rejection.selectedTestCode).toBeNull();
    expect(rejection.fieldErrors).toHaveLength(1);
    expect(rejection.fieldErrors[0].field).toBe("tests");
  });

  it("nie ujawnia nazwy scenariusza symulatora w treści odrzucenia", () => {
    const serialized = JSON.stringify(
      planLabOrderValidationRejection({ testCodes: ["CRP"] })
    );

    // Nazwa trybu środowiska nie może wystąpić jako samodzielna wartość JSON.
    // Kod błędu LAB_ORDER_VALIDATION_ERROR jest kontraktowy i dozwolony —
    // dlatego szukamy dokładnej wartości ":\"VALIDATION_ERROR\"", a nie podciągu.
    expect(serialized).not.toContain(':"VALIDATION_ERROR"');
    expect(serialized).not.toContain("scenario");
    expect(serialized).not.toContain("SIMULATOR");
    expect(serialized).not.toContain("LAB_SIMULATOR_SCENARIO");
  });

  it("nie kopiuje kodu badania do treści komunikatu widocznej dla personelu", () => {
    const rejection = planLabOrderValidationRejection({ testCodes: ["SEKRETNY_KOD"] });

    expect(rejection.fieldErrors[0].message).not.toContain("SEKRETNY_KOD");
  });
});
