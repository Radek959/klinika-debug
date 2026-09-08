import {
  validateCollectedAt,
  determineOrderStatusAfterSampleCollection,
  type SampleStatusValue
} from "./sample-collection";

describe("sample collection domain", () => {
  describe("validateCollectedAt", () => {
    const orderCreatedAt = new Date("2026-09-01T08:00:00.000Z");
    const now = new Date("2026-09-06T12:00:00.000Z");

    it("akceptuje datę pomiędzy utworzeniem zlecenia a teraz", () => {
      const collectedAt = new Date("2026-09-03T10:00:00.000Z");
      expect(validateCollectedAt(collectedAt, orderCreatedAt, now)).toEqual([]);
    });

    it("akceptuje datę równą utworzeniu zlecenia", () => {
      expect(validateCollectedAt(orderCreatedAt, orderCreatedAt, now)).toEqual([]);
    });

    it("akceptuje datę równą teraz", () => {
      expect(validateCollectedAt(now, orderCreatedAt, now)).toEqual([]);
    });

    it("odrzuca datę w przyszłości", () => {
      const collectedAt = new Date("2026-09-07T00:00:00.000Z");
      expect(validateCollectedAt(collectedAt, orderCreatedAt, now)).toEqual([
        { field: "collectedAt", code: "COLLECTED_AT_IN_FUTURE" }
      ]);
    });

    it("odrzuca datę wcześniejszą niż utworzenie zlecenia", () => {
      const collectedAt = new Date("2026-08-31T23:59:59.000Z");
      expect(validateCollectedAt(collectedAt, orderCreatedAt, now)).toEqual([
        { field: "collectedAt", code: "COLLECTED_AT_BEFORE_ORDER" }
      ]);
    });

    it("priorytetyzuje błąd przyszłej daty nad błędem daty przed zleceniem", () => {
      const futureOrderCreatedAt = new Date("2026-09-10T00:00:00.000Z");
      const collectedAt = new Date("2026-09-15T00:00:00.000Z");
      expect(
        validateCollectedAt(collectedAt, futureOrderCreatedAt, now)
      ).toEqual([{ field: "collectedAt", code: "COLLECTED_AT_IN_FUTURE" }]);
    });
  });

  describe("determineOrderStatusAfterSampleCollection", () => {
    it("zwraca SAMPLE_COLLECTION_IN_PROGRESS, gdy pozostały wymagane próbki", () => {
      const statuses: SampleStatusValue[] = ["COLLECTED", "REQUIRED"];
      expect(determineOrderStatusAfterSampleCollection(statuses)).toBe(
        "SAMPLE_COLLECTION_IN_PROGRESS"
      );
    });

    it("zwraca SAMPLE_COLLECTED, gdy wszystkie próbki są zarejestrowane", () => {
      const statuses: SampleStatusValue[] = ["COLLECTED", "COLLECTED"];
      expect(determineOrderStatusAfterSampleCollection(statuses)).toBe(
        "SAMPLE_COLLECTED"
      );
    });

    it("zwraca SAMPLE_COLLECTED dla pojedynczej wymaganej próbki po zarejestrowaniu", () => {
      const statuses: SampleStatusValue[] = ["COLLECTED"];
      expect(determineOrderStatusAfterSampleCollection(statuses)).toBe(
        "SAMPLE_COLLECTED"
      );
    });

    it("traktuje statusy SENT/ACCEPTED/REJECTED jako zarejestrowane", () => {
      const statuses: SampleStatusValue[] = ["SENT", "ACCEPTED", "REJECTED"];
      expect(determineOrderStatusAfterSampleCollection(statuses)).toBe(
        "SAMPLE_COLLECTED"
      );
    });

    it("[CLEAN] zwraca SAMPLE_COLLECTION_IN_PROGRESS po pierwszej z dwóch wymaganych próbek", () => {
      const statuses: SampleStatusValue[] = ["COLLECTED", "REQUIRED"];
      expect(
        determineOrderStatusAfterSampleCollection(statuses, {
          forceCollectedAfterFirstSample: false
        })
      ).toBe("SAMPLE_COLLECTION_IN_PROGRESS");
    });

    it("[WORKSHOP CONTROLLED DEFECT: ORDER_FLOW aktywny] zwraca SAMPLE_COLLECTED po PIERWSZEJ z dwóch wymaganych próbek", () => {
      const statuses: SampleStatusValue[] = ["COLLECTED", "REQUIRED"];
      expect(
        determineOrderStatusAfterSampleCollection(statuses, {
          forceCollectedAfterFirstSample: true
        })
      ).toBe("SAMPLE_COLLECTED");
    });

    it("ORDER_FLOW nie zmienia zachowania, gdy żadna próbka nie została jeszcze zarejestrowana", () => {
      const statuses: SampleStatusValue[] = ["REQUIRED", "REQUIRED"];
      expect(
        determineOrderStatusAfterSampleCollection(statuses, {
          forceCollectedAfterFirstSample: true
        })
      ).toBe("SAMPLE_COLLECTION_IN_PROGRESS");
    });

    it("ORDER_FLOW nie zmienia zachowania, gdy wszystkie próbki są już zarejestrowane", () => {
      const statuses: SampleStatusValue[] = ["COLLECTED", "COLLECTED"];
      expect(
        determineOrderStatusAfterSampleCollection(statuses, {
          forceCollectedAfterFirstSample: true
        })
      ).toBe("SAMPLE_COLLECTED");
    });
  });
});
