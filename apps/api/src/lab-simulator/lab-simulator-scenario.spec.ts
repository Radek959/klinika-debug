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

  it("toleruje otaczające białe znaki", () => {
    expect(resolveLabSimulatorScenario("  PARTIAL_SUCCESS  ")).toBe("PARTIAL_SUCCESS");
  });

  it("rzuca błąd dla nieprawidłowej wartości zamiast cicho przyjmować domyślną", () => {
    expect(() => resolveLabSimulatorScenario("SAMPLE_REJECTED")).toThrow(
      /LAB_SIMULATOR_SCENARIO/
    );
  });

  it("rzuca błąd dla wartości o innej wielkości liter niż zdefiniowana", () => {
    expect(() => resolveLabSimulatorScenario("success")).toThrow(/LAB_SIMULATOR_SCENARIO/);
  });
});
