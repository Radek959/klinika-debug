import { redactSecrets, serializeBootstrapError } from "./bootstrap-error";

describe("bootstrap error logging", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DATABASE_URL: "mysql://klinika:tajne-haslo@localhost:3306/klinika",
      SESSION_TOKEN_PEPPER: "sekretny-pepper"
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("maskuje sekrety i hasło z DATABASE_URL", () => {
    const text =
      "Błąd mysql://klinika:tajne-haslo@localhost:3306/klinika sekretny-pepper";

    expect(redactSecrets(text)).toBe(
      "Błąd [REDACTED] [REDACTED]"
    );
  });

  it("zachowuje stack błędu bootstrapu bez sekretów", () => {
    const cause = new Error(
      "DATABASE_URL mysql://klinika:tajne-haslo@localhost:3306/klinika"
    );
    const error = new Error("Start failed", { cause });
    error.stack =
      "Error: Start failed\n" +
      "    at mysql://klinika:tajne-haslo@localhost:3306/klinika";

    const serialized = serializeBootstrapError(error);

    expect(JSON.stringify(serialized)).toContain("Start failed");
    expect(JSON.stringify(serialized)).toContain("stack");
    expect(JSON.stringify(serialized)).not.toContain("tajne-haslo");
    expect(JSON.stringify(serialized)).not.toContain("sekretny-pepper");
  });
});
