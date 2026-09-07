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
});
