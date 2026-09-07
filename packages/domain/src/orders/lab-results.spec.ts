import {
  generateSyntheticResult,
  determineOrderStatusAfterResults,
  splitMedicalTestIdsForPartialSuccess,
  computePartialSuccessCallbackOffsets
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

  describe("splitMedicalTestIdsForPartialSuccess", () => {
    it("dzieli dwa badania na dwa niepuste, rozłączne podzbiory", () => {
      const split = splitMedicalTestIdsForPartialSuccess(["test-b", "test-a"]);
      expect(split.firstBatchTestIds).toEqual(["test-a"]);
      expect(split.secondBatchTestIds).toEqual(["test-b"]);
    });

    it("dzieli nieparzystą liczbę badań na dwa niepuste podzbiory", () => {
      const split = splitMedicalTestIdsForPartialSuccess([
        "test-c",
        "test-a",
        "test-b"
      ]);
      expect(split.firstBatchTestIds).toEqual(["test-a", "test-b"]);
      expect(split.secondBatchTestIds).toEqual(["test-c"]);
      expect(split.firstBatchTestIds.length).toBeGreaterThan(0);
      expect(split.secondBatchTestIds.length).toBeGreaterThan(0);
    });

    it("jest deterministyczne — ten sam zestaw badań daje ten sam podział niezależnie od kolejności wejściowej", () => {
      const first = splitMedicalTestIdsForPartialSuccess(["test-a", "test-b", "test-c"]);
      const second = splitMedicalTestIdsForPartialSuccess(["test-c", "test-b", "test-a"]);
      expect(first).toEqual(second);
    });

    it("nie zawiera duplikatów ani brakujących badań względem wejścia", () => {
      const input = ["test-a", "test-b", "test-c", "test-d"];
      const split = splitMedicalTestIdsForPartialSuccess(input);
      const combined = [...split.firstBatchTestIds, ...split.secondBatchTestIds].sort();
      expect(combined).toEqual([...input].sort());
    });

    it("rzuca błąd dla zlecenia z jednym badaniem — brak dzielenia pojedynczego badania", () => {
      expect(() => splitMedicalTestIdsForPartialSuccess(["test-a"])).toThrow(
        /co najmniej dwóch badań/
      );
    });

    it("rzuca błąd dla pustej listy badań", () => {
      expect(() => splitMedicalTestIdsForPartialSuccess([])).toThrow();
    });
  });

  describe("computePartialSuccessCallbackOffsets", () => {
    it("planuje pierwszy callback około połowy całkowitego opóźnienia", () => {
      const offsets = computePartialSuccessCallbackOffsets(1000);
      expect(offsets.finalCallbackOffsetMs).toBe(1000);
      expect(offsets.firstCallbackOffsetMs).toBe(500);
      expect(offsets.firstCallbackOffsetMs).toBeLessThan(offsets.finalCallbackOffsetMs);
    });

    it("zachowuje ścisłą kolejność przy bardzo małym dodatnim opóźnieniu", () => {
      const offsets = computePartialSuccessCallbackOffsets(1);
      expect(offsets.finalCallbackOffsetMs).toBe(1);
      expect(offsets.firstCallbackOffsetMs).toBe(0);
      expect(offsets.firstCallbackOffsetMs).toBeLessThan(offsets.finalCallbackOffsetMs);
    });

    it("zachowuje ścisłą kolejność, gdy skonfigurowane opóźnienie wynosi zero", () => {
      const offsets = computePartialSuccessCallbackOffsets(0);
      expect(offsets.finalCallbackOffsetMs).toBeGreaterThan(0);
      expect(offsets.firstCallbackOffsetMs).toBeLessThan(offsets.finalCallbackOffsetMs);
    });

    it("zachowuje ścisłą kolejność dla nieparzystego opóźnienia", () => {
      const offsets = computePartialSuccessCallbackOffsets(7);
      expect(offsets.firstCallbackOffsetMs).toBe(3);
      expect(offsets.finalCallbackOffsetMs).toBe(7);
    });
  });

  describe("determineOrderStatusAfterResults z badaniem odrzuconym", () => {
    it("nie uznaje badania REJECTED za wykonane", () => {
      expect(determineOrderStatusAfterResults(["COMPLETED", "REJECTED"])).toBe("PARTIAL");
    });

    it("nadal zwraca COMPLETED, gdy wszystkie badania mają wynik", () => {
      expect(determineOrderStatusAfterResults(["COMPLETED", "COMPLETED"])).toBe(
        "COMPLETED"
      );
    });
  });
});
