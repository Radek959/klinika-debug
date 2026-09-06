import {
  isMinorOnDate,
  validatePatientFinalState,
  type PatientWriteState
} from "@klinika/domain";

describe("patient write domain rules", () => {
  const adultPeselPatient: PatientWriteState = {
    firstName: "Łukasz",
    lastName: "Nowak-Testowy",
    identifierType: "PESEL",
    pesel: "44051401458",
    birthDate: "1944-05-14",
    gender: "MALE",
    phone: "+48123123123",
    active: true
  };

  it("akceptuje imiona i nazwiska z polskimi znakami, spacją, apostrofem i łącznikiem", () => {
    const result = validatePatientFinalState(
      {
        ...adultPeselPatient,
        firstName: "  Anna Maria  ",
        lastName: "Żółć-O'Neill"
      },
      new Date("2026-09-05T00:00:00.000Z")
    );

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.firstName).toBe("Anna Maria");
      expect(result.value.lastName).toBe("Żółć-O'Neill");
    }
  });

  it("odrzuca błędne nazwy", () => {
    const result = validatePatientFinalState(
      {
        ...adultPeselPatient,
        firstName: "-'",
        lastName: "A"
      },
      new Date("2026-09-05T00:00:00.000Z")
    );

    expect(result).toMatchObject({
      valid: false,
      errors: [
        { field: "firstName", code: "INVALID_NAME" },
        { field: "lastName", code: "INVALID_NAME" }
      ]
    });
  });

  it("waliduje telefon i e-mail", () => {
    expect(
      validatePatientFinalState(
        { ...adultPeselPatient, phone: "123456789", email: "jan@example.test" },
        new Date("2026-09-05T00:00:00.000Z")
      ).valid
    ).toBe(true);

    const result = validatePatientFinalState(
      { ...adultPeselPatient, phone: "123", email: "nie-email" },
      new Date("2026-09-05T00:00:00.000Z")
    );

    expect(result).toMatchObject({
      valid: false,
      errors: [
        { field: "phone", code: "INVALID_PHONE" },
        { field: "email", code: "INVALID_EMAIL" }
      ]
    });
  });

  it("sprawdza zgodność daty urodzenia i płci z numerem PESEL", () => {
    const result = validatePatientFinalState(
      {
        ...adultPeselPatient,
        birthDate: "1944-05-15",
        gender: "FEMALE"
      },
      new Date("2026-09-05T00:00:00.000Z")
    );

    expect(result).toMatchObject({
      valid: false,
      errors: [
        { field: "birthDate", code: "PESEL_BIRTH_DATE_MISMATCH" },
        { field: "gender", code: "PESEL_GENDER_MISMATCH" }
      ]
    });
  });

  it("oblicza pełnoletność deterministycznie, w tym dzień 18. urodzin", () => {
    expect(
      isMinorOnDate("2008-09-06", new Date("2026-09-05T12:00:00.000Z"))
    ).toBe(true);
    expect(
      isMinorOnDate("2008-09-05", new Date("2026-09-05T00:00:00.000Z"))
    ).toBe(false);
  });

  it("waliduje pełny stan końcowy częściowej aktualizacji", () => {
    const existing: PatientWriteState = {
      ...adultPeselPatient,
      phone: "+48123123123",
      email: null
    };
    const finalState = {
      ...existing,
      phone: null
    };

    const result = validatePatientFinalState(
      finalState,
      new Date("2026-09-05T00:00:00.000Z")
    );

    expect(result).toMatchObject({
      valid: false,
      errors: [{ field: "contact", code: "CONTACT_REQUIRED" }]
    });
  });

  it("odrzuca niepoprawną wartość active zamiast traktować null jak wartość domyślną", () => {
    const result = validatePatientFinalState(
      { ...adultPeselPatient, active: null },
      new Date("2026-09-05T00:00:00.000Z")
    );

    expect(result).toMatchObject({
      valid: false,
      errors: [{ field: "active", code: "INVALID_ACTIVE_VALUE" }]
    });
  });

  it("nie dodaje GUARDIAN_REQUIRED, gdy przekazano opiekuna z błędnymi danymi", () => {
    const result = validatePatientFinalState(
      {
        firstName: "Maja",
        lastName: "Syntetyczna",
        identifierType: "PESEL",
        pesel: "18210112349",
        birthDate: "2018-01-01",
        gender: "FEMALE",
        phone: "123456789",
        guardian: {
          firstName: "Karolina",
          lastName: "Syntetyczna"
        }
      },
      new Date("2026-09-05T00:00:00.000Z")
    );

    expect(result).toMatchObject({
      valid: false,
      errors: [{ field: "guardian.contact", code: "GUARDIAN_CONTACT_REQUIRED" }]
    });
    if (!result.valid) {
      expect(result.errors).not.toContainEqual({
        field: "guardian",
        code: "GUARDIAN_REQUIRED"
      });
    }
  });

  it("odrzuca opcjonalne pola tekstowe dłuższe niż pojemność kolumny", () => {
    const result = validatePatientFinalState(
      {
        ...adultPeselPatient,
        citizenship: "P".repeat(192),
        addressCity: "W".repeat(192),
        guardian: {
          firstName: "Maria",
          lastName: "Testowa",
          email: "a".repeat(192)
        }
      },
      new Date("2026-09-05T00:00:00.000Z")
    );

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        { field: "citizenship", code: "MAX_LENGTH_EXCEEDED" },
        { field: "addressCity", code: "MAX_LENGTH_EXCEEDED" },
        { field: "guardian.email", code: "MAX_LENGTH_EXCEEDED" }
      ])
    });
  });
});
