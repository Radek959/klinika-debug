import {
  generateSyntheticResult,
  determineOrderStatusAfterResults
} from "./lab-results";

describe("lab results domain", () => {
  describe("generateSyntheticResult", () => {
    it("generuje wartość liczbową z flagą NORMAL dla parametru NUMERIC", () => {
      const result = generateSyntheticResult("order-1:CRP:CRP", {
        code: "CRP",
        valueType: "NUMERIC",
        unit: "mg/L"
      });

      expect(result.code).toBe("CRP");
      expect(result.unit).toBe("mg/L");
      expect(result.flag).toBe("NORMAL");
      expect(Number.isNaN(Number(result.value))).toBe(false);
    });

    it("generuje wartość tekstową z flagą NOT_APPLICABLE dla parametru TEXT", () => {
      const result = generateSyntheticResult("order-1:URINE:COLOR", {
        code: "COLOR",
        valueType: "TEXT",
        unit: null
      });

      expect(result.code).toBe("COLOR");
      expect(result.unit).toBeNull();
      expect(result.flag).toBe("NOT_APPLICABLE");
      expect(typeof result.value).toBe("string");
      expect(result.value.length).toBeGreaterThan(0);
    });

    it("jest deterministyczne dla tego samego seeda", () => {
      const parameter = { code: "GLU", valueType: "NUMERIC" as const, unit: "mg/dL" };
      const first = generateSyntheticResult("order-42:GLU:GLU", parameter);
      const second = generateSyntheticResult("order-42:GLU:GLU", parameter);
      expect(first).toEqual(second);
    });

    it("zwraca różne wartości dla różnych seedów", () => {
      const parameter = { code: "GLU", valueType: "NUMERIC" as const, unit: "mg/dL" };
      const first = generateSyntheticResult("order-1:GLU:GLU", parameter);
      const second = generateSyntheticResult("order-2:GLU:GLU", parameter);
      expect(first.value).not.toBe(second.value);
    });
  });

  describe("determineOrderStatusAfterResults", () => {
    it("zwraca COMPLETED, gdy wszystkie badania mają status COMPLETED", () => {
      expect(determineOrderStatusAfterResults(["COMPLETED", "COMPLETED"])).toBe(
        "COMPLETED"
      );
    });

    it("zwraca PARTIAL, gdy część badań pozostaje PENDING", () => {
      expect(determineOrderStatusAfterResults(["COMPLETED", "PENDING"])).toBe(
        "PARTIAL"
      );
    });
  });
});
