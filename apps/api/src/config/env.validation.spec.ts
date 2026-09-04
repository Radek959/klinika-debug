import { validateEnvironment } from "./env.validation";

describe("validateEnvironment", () => {
  it("akceptuje minimalną poprawną konfigurację Etapu 1", () => {
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
      SESSION_TOKEN_PEPPER: "test-session-pepper"
    });
  });

  it("zatrzymuje start z czytelnym błędem przy brakach konfiguracji", () => {
    expect(() => validateEnvironment({ NODE_ENV: "production" })).toThrow(
      /Nieprawidłowa konfiguracja aplikacji/
    );
  });
});
