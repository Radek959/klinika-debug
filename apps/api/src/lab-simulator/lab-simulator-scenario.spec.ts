import { resolveLabSimulatorScenario } from "./lab-simulator-scenario";

describe("resolveLabSimulatorScenario", () => {
  it("zwraca SUCCESS, gdy zmienna środowiskowa nie jest ustawiona", () => {
    expect(resolveLabSimulatorScenario(undefined)).toBe("SUCCESS");
  });

  it("zwraca SUCCESS dla pustego łańcucha znaków", () => {
    expect(resolveLabSimulatorScenario("")).toBe("SUCCESS");
    expect(resolveLabSimulatorScenario("   ")).toBe("SUCCESS");
  });

  it("rozpoznaje SUCCESS", () => {
    expect(resolveLabSimulatorScenario("SUCCESS")).toBe("SUCCESS");
  });

  it("rozpoznaje PARTIAL_SUCCESS", () => {
    expect(resolveLabSimulatorScenario("PARTIAL_SUCCESS")).toBe("PARTIAL_SUCCESS");
  });

  it("rozpoznaje SAMPLE_REJECTED", () => {
    expect(resolveLabSimulatorScenario("SAMPLE_REJECTED")).toBe("SAMPLE_REJECTED");
  });

  it("rozpoznaje VALIDATION_ERROR", () => {
    expect(resolveLabSimulatorScenario("VALIDATION_ERROR")).toBe("VALIDATION_ERROR");
  });

  it("rozpoznaje RATE_LIMIT", () => {
    expect(resolveLabSimulatorScenario("RATE_LIMIT")).toBe("RATE_LIMIT");
  });

  it("toleruje otaczające białe znaki", () => {
    expect(resolveLabSimulatorScenario("  PARTIAL_SUCCESS  ")).toBe("PARTIAL_SUCCESS");
  });

  it("rzuca błąd dla nieprawidłowej wartości zamiast cicho przyjmować domyślną", () => {
    expect(() => resolveLabSimulatorScenario("NOT_A_SCENARIO")).toThrow(
      /LAB_SIMULATOR_SCENARIO/
    );
  });

  it("rzuca błąd dla wartości o innej wielkości liter niż zdefiniowana", () => {
    expect(() => resolveLabSimulatorScenario("success")).toThrow(/LAB_SIMULATOR_SCENARIO/);
    expect(() => resolveLabSimulatorScenario("sample_rejected")).toThrow(
      /LAB_SIMULATOR_SCENARIO/
    );
    expect(() => resolveLabSimulatorScenario("validation_error")).toThrow(
      /LAB_SIMULATOR_SCENARIO/
    );
    expect(() => resolveLabSimulatorScenario("rate_limit")).toThrow(
      /LAB_SIMULATOR_SCENARIO/
    );
  });

  it("wymienia w komunikacie błędu wszystkie dozwolone scenariusze", () => {
    expect(() => resolveLabSimulatorScenario("NOT_A_SCENARIO")).toThrow(
      /SUCCESS, PARTIAL_SUCCESS, SAMPLE_REJECTED, VALIDATION_ERROR, RATE_LIMIT/
    );
  });

  it("nie akceptuje wartości spoza listy scenariuszy", () => {
    // Kod błędu API LAB_ORDER_VALIDATION_ERROR nie jest nazwą scenariusza.
    expect(() => resolveLabSimulatorScenario("LAB_ORDER_VALIDATION_ERROR")).toThrow(
      /LAB_SIMULATOR_SCENARIO/
    );
    // Kod błędu API LAB_RATE_LIMITED też nie jest nazwą scenariusza.
    expect(() => resolveLabSimulatorScenario("LAB_RATE_LIMITED")).toThrow(
      /LAB_SIMULATOR_SCENARIO/
    );
    expect(() => resolveLabSimulatorScenario("SERVER_ERROR")).toThrow(
      /LAB_SIMULATOR_SCENARIO/
    );
  });
});
