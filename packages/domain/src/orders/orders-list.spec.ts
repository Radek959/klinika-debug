import {
  parseDate,
  normalizeCreatedToDate,
  validateDateRange,
  normalizeSearch,
  sortMaterialTypes
} from "./orders-list";

describe("orders-list domain validators", () => {
  describe("parseDate", () => {
    it("parses valid date string", () => {
      const date = parseDate("2026-09-06", "createdFrom");
      expect(date).toBeInstanceOf(Date);
      expect(date!.getUTCFullYear()).toBe(2026);
      expect(date!.getUTCMonth()).toBe(8); // 0-indexed
      expect(date!.getUTCDate()).toBe(6);
    });

    it("returns null for empty string", () => {
      const date = parseDate("", "createdFrom");
      expect(date).toBeNull();
    });

    it("returns null for whitespace string", () => {
      const date = parseDate("   ", "createdFrom");
      expect(date).toBeNull();
    });

    it("returns null for undefined", () => {
      const date = parseDate(undefined, "createdFrom");
      expect(date).toBeNull();
    });

    it("throws error for invalid format", () => {
      expect(() => parseDate("2026/09/06", "createdFrom")).toThrow();
      expect(() => parseDate("09-06-2026", "createdFrom")).toThrow();
      expect(() => parseDate("2026-9-6", "createdFrom")).toThrow();
    });

    it("throws error for impossible date", () => {
      expect(() => parseDate("2026-02-30", "createdFrom")).toThrow();
      expect(() => parseDate("2026-13-01", "createdFrom")).toThrow();
      expect(() => parseDate("2026-00-01", "createdFrom")).toThrow();
    });

    it("throws error with field name in exception", () => {
      try {
        parseDate("invalid-date", "testField");
        fail("Should have thrown");
      } catch (error: any) {
        expect(error.field).toBe("testField");
        expect(error.code).toBe("INVALID_DATE_FORMAT");
      }
    });
  });

  describe("normalizeCreatedToDate", () => {
    it("converts date to exclusive start of next day", () => {
      const date = new Date("2026-09-06T00:00:00.000Z");
      const normalized = normalizeCreatedToDate(date);

      expect(normalized.getUTCFullYear()).toBe(2026);
      expect(normalized.getUTCMonth()).toBe(8);
      expect(normalized.getUTCDate()).toBe(7);
      expect(normalized.getUTCHours()).toBe(0);
      expect(normalized.getUTCMinutes()).toBe(0);
      expect(normalized.getUTCSeconds()).toBe(0);
    });

    it("handles end of month correctly", () => {
      const date = new Date("2026-09-30T00:00:00.000Z");
      const normalized = normalizeCreatedToDate(date);

      expect(normalized.getUTCFullYear()).toBe(2026);
      expect(normalized.getUTCMonth()).toBe(9); // October
      expect(normalized.getUTCDate()).toBe(1);
    });

    it("handles end of year correctly", () => {
      const date = new Date("2026-12-31T00:00:00.000Z");
      const normalized = normalizeCreatedToDate(date);

      expect(normalized.getUTCFullYear()).toBe(2027);
      expect(normalized.getUTCMonth()).toBe(0); // January
      expect(normalized.getUTCDate()).toBe(1);
    });
  });

  describe("validateDateRange", () => {
    it("returns empty array for valid range", () => {
      const from = new Date("2026-09-01T00:00:00.000Z");
      const to = new Date("2026-09-10T00:00:00.000Z");
      const errors = validateDateRange(from, to);
      expect(errors).toEqual([]);
    });

    it("returns empty array for same date", () => {
      const date = new Date("2026-09-01T00:00:00.000Z");
      const errors = validateDateRange(date, date);
      expect(errors).toEqual([]);
    });

    it("returns errors when createdFrom is after createdTo", () => {
      const from = new Date("2026-09-10T00:00:00.000Z");
      const to = new Date("2026-09-01T00:00:00.000Z");
      const errors = validateDateRange(from, to);

      expect(errors).toHaveLength(2);
      expect(errors).toContainEqual({
        field: "createdFrom",
        code: "INVALID_DATE_RANGE"
      });
      expect(errors).toContainEqual({
        field: "createdTo",
        code: "INVALID_DATE_RANGE"
      });
    });

    it("returns empty array when only createdFrom is provided", () => {
      const from = new Date("2026-09-10T00:00:00.000Z");
      const errors = validateDateRange(from, null);
      expect(errors).toEqual([]);
    });

    it("returns empty array when only createdTo is provided", () => {
      const to = new Date("2026-09-01T00:00:00.000Z");
      const errors = validateDateRange(null, to);
      expect(errors).toEqual([]);
    });

    it("returns empty array when both are null", () => {
      const errors = validateDateRange(null, null);
      expect(errors).toEqual([]);
    });
  });

  describe("normalizeSearch", () => {
    it("trims whitespace from search term", () => {
      const result = normalizeSearch("   test   ");
      expect(result).toBe("test");
    });

    it("returns null for empty string", () => {
      const result = normalizeSearch("");
      expect(result).toBeNull();
    });

    it("returns null for whitespace-only string", () => {
      const result = normalizeSearch("   ");
      expect(result).toBeNull();
    });

    it("returns null for undefined", () => {
      const result = normalizeSearch(undefined);
      expect(result).toBeNull();
    });

    it("preserves internal spaces", () => {
      const result = normalizeSearch("  multiple  words  ");
      expect(result).toBe("multiple  words");
    });

    it("preserves special characters", () => {
      const result = normalizeSearch("  test-123_ABC  ");
      expect(result).toBe("test-123_ABC");
    });
  });

  it("sortuje materiały w kolejności wymaganej przez API", () => {
    expect(["URINE", "SERUM", "EDTA_BLOOD"].sort(sortMaterialTypes)).toEqual([
      "EDTA_BLOOD",
      "SERUM",
      "URINE"
    ]);
  });
});
