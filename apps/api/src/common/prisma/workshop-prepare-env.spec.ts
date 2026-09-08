import {
  resolveWorkshopParticipantCount,
  validateWorkshopPrepareEnvironment
} from "./workshop-prepare-env";

describe("resolveWorkshopParticipantCount", () => {
  it("zwraca domyślną liczbę 15, gdy WORKSHOP_PARTICIPANTS nie jest ustawione", () => {
    expect(resolveWorkshopParticipantCount({})).toBe(15);
  });

  it("zwraca domyślną liczbę 15, gdy WORKSHOP_PARTICIPANTS jest puste", () => {
    expect(resolveWorkshopParticipantCount({ WORKSHOP_PARTICIPANTS: "  " })).toBe(15);
  });

  it("zwraca niestandardową liczbę uczestników", () => {
    expect(resolveWorkshopParticipantCount({ WORKSHOP_PARTICIPANTS: "8" })).toBe(8);
  });

  it("odrzuca nieliczbową wartość", () => {
    expect(() =>
      resolveWorkshopParticipantCount({ WORKSHOP_PARTICIPANTS: "abc" })
    ).toThrow(/Nieprawidłowa wartość WORKSHOP_PARTICIPANTS/);
  });

  it("odrzuca zero i wartości ujemne", () => {
    expect(() =>
      resolveWorkshopParticipantCount({ WORKSHOP_PARTICIPANTS: "0" })
    ).toThrow(/Nieprawidłowa wartość WORKSHOP_PARTICIPANTS/);
    expect(() =>
      resolveWorkshopParticipantCount({ WORKSHOP_PARTICIPANTS: "-3" })
    ).toThrow(/Nieprawidłowa wartość WORKSHOP_PARTICIPANTS/);
  });

  it("odrzuca liczbę powyżej dopuszczalnego maksimum", () => {
    expect(() =>
      resolveWorkshopParticipantCount({ WORKSHOP_PARTICIPANTS: "100" })
    ).toThrow(/Nieprawidłowa wartość WORKSHOP_PARTICIPANTS/);
  });
});

describe("validateWorkshopPrepareEnvironment", () => {
  const validEnv = {
    NODE_ENV: "production",
    DATABASE_URL: "mysql://user:password@localhost:3306/klinika",
    WORKSHOP_STAFF_PASSWORD: "WarsztatTestowe123!",
    ADMIN_PASSWORD_HASH: "argon2id-hash-value",
    ADMIN_SESSION_SECRET: "a-sufficiently-long-secret-value"
  };

  it("akceptuje kompletną konfigurację produkcyjną", () => {
    expect(() => validateWorkshopPrepareEnvironment(validEnv)).not.toThrow();
  });

  it("wymaga WORKSHOP_STAFF_PASSWORD w produkcji", () => {
    expect(() =>
      validateWorkshopPrepareEnvironment({
        ...validEnv,
        WORKSHOP_STAFF_PASSWORD: undefined
      })
    ).toThrow(/WORKSHOP_STAFF_PASSWORD/);
  });

  it("nie wymaga WORKSHOP_STAFF_PASSWORD poza produkcją", () => {
    expect(() =>
      validateWorkshopPrepareEnvironment({
        ...validEnv,
        NODE_ENV: "development",
        WORKSHOP_STAFF_PASSWORD: undefined
      })
    ).not.toThrow();
  });

  it("wymaga ADMIN_PASSWORD_HASH", () => {
    expect(() =>
      validateWorkshopPrepareEnvironment({ ...validEnv, ADMIN_PASSWORD_HASH: undefined })
    ).toThrow(/ADMIN_PASSWORD_HASH/);
  });

  it("wymaga wystarczająco długiego ADMIN_SESSION_SECRET", () => {
    expect(() =>
      validateWorkshopPrepareEnvironment({ ...validEnv, ADMIN_SESSION_SECRET: "short" })
    ).toThrow(/ADMIN_SESSION_SECRET/);
  });

  it("wymaga DATABASE_URL", () => {
    expect(() =>
      validateWorkshopPrepareEnvironment({ ...validEnv, DATABASE_URL: undefined })
    ).toThrow(/DATABASE_URL/);
  });

  it("nie wypisuje wartości sekretów w komunikacie błędu", () => {
    try {
      validateWorkshopPrepareEnvironment({
        ...validEnv,
        ADMIN_SESSION_SECRET: undefined
      });
      fail("oczekiwano błędu");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(validEnv.WORKSHOP_STAFF_PASSWORD);
      expect(message).not.toContain(validEnv.ADMIN_PASSWORD_HASH);
    }
  });
});
