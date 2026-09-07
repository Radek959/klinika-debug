import { validateEnvironment } from "./env.validation";

describe("validateEnvironment", () => {
  it("akceptuje minimalną poprawną konfigurację Etapu 1 i domyślny scenariusz SUCCESS", () => {
    expect(
      validateEnvironment({
        NODE_ENV: "test",
        PORT: "3000",
        DATABASE_URL: "mysql://user:password@localhost:3306/klinika",
        SESSION_TOKEN_PEPPER: "test-session-pepper"
      })
    ).toEqual({
      NODE_ENV: "test",
      PORT: "3000",
      DATABASE_URL: "mysql://user:password@localhost:3306/klinika",
      SESSION_TOKEN_PEPPER: "test-session-pepper",
      LAB_SIMULATOR_SCENARIO: "SUCCESS"
    });
  });

  it("akceptuje jawnie ustawiony scenariusz PARTIAL_SUCCESS", () => {
    expect(
      validateEnvironment({
        NODE_ENV: "test",
        PORT: "3000",
        DATABASE_URL: "mysql://user:password@localhost:3306/klinika",
        SESSION_TOKEN_PEPPER: "test-session-pepper",
        LAB_SIMULATOR_SCENARIO: "PARTIAL_SUCCESS"
      }).LAB_SIMULATOR_SCENARIO
    ).toBe("PARTIAL_SUCCESS");
  });

  it("akceptuje jawnie ustawiony scenariusz SAMPLE_REJECTED", () => {
    expect(
      validateEnvironment({
        NODE_ENV: "test",
        PORT: "3000",
        DATABASE_URL: "mysql://user:password@localhost:3306/klinika",
        SESSION_TOKEN_PEPPER: "test-session-pepper",
        LAB_SIMULATOR_SCENARIO: "SAMPLE_REJECTED"
      }).LAB_SIMULATOR_SCENARIO
    ).toBe("SAMPLE_REJECTED");
  });

  it("akceptuje jawnie ustawiony scenariusz VALIDATION_ERROR", () => {
    expect(
      validateEnvironment({
        NODE_ENV: "test",
        PORT: "3000",
        DATABASE_URL: "mysql://user:password@localhost:3306/klinika",
        SESSION_TOKEN_PEPPER: "test-session-pepper",
        LAB_SIMULATOR_SCENARIO: "VALIDATION_ERROR"
      }).LAB_SIMULATOR_SCENARIO
    ).toBe("VALIDATION_ERROR");
  });

  it("akceptuje jawnie ustawiony scenariusz RATE_LIMIT", () => {
    expect(
      validateEnvironment({
        NODE_ENV: "test",
        PORT: "3000",
        DATABASE_URL: "mysql://user:password@localhost:3306/klinika",
        SESSION_TOKEN_PEPPER: "test-session-pepper",
        LAB_SIMULATOR_SCENARIO: "RATE_LIMIT"
      }).LAB_SIMULATOR_SCENARIO
    ).toBe("RATE_LIMIT");
  });

  it("zatrzymuje start z czytelnym błędem przy brakach konfiguracji", () => {
    expect(() => validateEnvironment({ NODE_ENV: "production" })).toThrow(
      /Nieprawidłowa konfiguracja aplikacji/
    );
  });

  it("zatrzymuje start z czytelnym błędem przy nieprawidłowym LAB_SIMULATOR_SCENARIO", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "test",
        PORT: "3000",
        DATABASE_URL: "mysql://user:password@localhost:3306/klinika",
        SESSION_TOKEN_PEPPER: "test-session-pepper",
        LAB_SIMULATOR_SCENARIO: "NOT_A_SCENARIO"
      })
    ).toThrow(/LAB_SIMULATOR_SCENARIO/);
  });

  it("wymienia w komunikacie błędu wszystkie dozwolone scenariusze", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "test",
        PORT: "3000",
        DATABASE_URL: "mysql://user:password@localhost:3306/klinika",
        SESSION_TOKEN_PEPPER: "test-session-pepper",
        LAB_SIMULATOR_SCENARIO: "NOT_A_SCENARIO"
      })
    ).toThrow(/SUCCESS, PARTIAL_SUCCESS, SAMPLE_REJECTED, VALIDATION_ERROR/);
  });
});
