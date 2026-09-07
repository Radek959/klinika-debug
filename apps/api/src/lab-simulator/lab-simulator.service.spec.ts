import { LabSimulatorService, type LabSimulatorOrderInput } from "./lab-simulator.service";

const ORIGINAL_ENV = { ...process.env };
const TEST_CORRELATION_ID = "correlation-order-1-send";

function buildInput(testCount: number): LabSimulatorOrderInput {
  // Wszystkie badania w tym wariancie korzystają z tego samego materiału, więc
  // zlecenie ma dokładnie jedną próbkę.
  return {
    workspaceId: "workspace-1",
    orderId: "order-1",
    correlationId: TEST_CORRELATION_ID,
    tests: Array.from({ length: testCount }, (_, index) => ({
      medicalTestId: `test-${index}`,
      materialType: "SERUM" as const,
      parameters: [{ code: "CODE", valueType: "NUMERIC" as const, unit: "mg/L" }]
    })),
    samples: [{ sampleId: "sample-serum", materialType: "SERUM" as const }]
  };
}

/** Zlecenie z badaniami na trzech różnych materiałach i trzema próbkami. */
function buildMultiMaterialInput(): LabSimulatorOrderInput {
  return {
    workspaceId: "workspace-1",
    orderId: "order-1",
    correlationId: TEST_CORRELATION_ID,
    tests: [
      {
        medicalTestId: "test-morf",
        materialType: "EDTA_BLOOD" as const,
        parameters: [{ code: "HGB", valueType: "NUMERIC" as const, unit: "g/dL" }]
      },
      {
        medicalTestId: "test-crp",
        materialType: "SERUM" as const,
        parameters: [{ code: "CRP", valueType: "NUMERIC" as const, unit: "mg/L" }]
      },
      {
        medicalTestId: "test-urine",
        materialType: "URINE" as const,
        parameters: [{ code: "PH", valueType: "NUMERIC" as const, unit: null }]
      }
    ],
    samples: [
      { sampleId: "sample-urine", materialType: "URINE" as const },
      { sampleId: "sample-blood", materialType: "EDTA_BLOOD" as const },
      { sampleId: "sample-serum", materialType: "SERUM" as const }
    ]
  };
}

describe("LabSimulatorService", () => {
  let service: LabSimulatorService;

  beforeEach(() => {
    service = new LabSimulatorService();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe("scenariusz SUCCESS (domyślny)", () => {
    it("tworzy jedno zadanie z kompletem wyników, gdy LAB_SIMULATOR_SCENARIO nie jest ustawione", () => {
      delete process.env.LAB_SIMULATOR_SCENARIO;
      const input = buildInput(2);

      const result = service.acceptOrder(input);

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].scenario).toBe("SUCCESS");
      expect(result.jobs[0].payload.status).toBe("COMPLETED");
      expect(result.jobs[0].payload.pendingMedicalTestIds).toEqual([]);
      expect(result.jobs[0].payload.results.map((r) => r.medicalTestId).sort()).toEqual(
        ["test-0", "test-1"].sort()
      );
      expect(result.jobs[0].executeAt).toEqual(result.estimatedCompletionAt);
    });

    it("nie zmienia zachowania SUCCESS, gdy jawnie ustawiono LAB_SIMULATOR_SCENARIO=SUCCESS", () => {
      process.env.LAB_SIMULATOR_SCENARIO = "SUCCESS";
      const result = service.acceptOrder(buildInput(3));

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].scenario).toBe("SUCCESS");
      expect(result.jobs[0].payload.status).toBe("COMPLETED");
      expect(result.jobs[0].payload.results).toHaveLength(3);
    });

    it("ustawia w callbacku correlationId przekazany do symulatora, a nie null", () => {
      delete process.env.LAB_SIMULATOR_SCENARIO;
      const result = service.acceptOrder(buildInput(2));

      expect(result.jobs[0].payload.correlationId).not.toBeNull();
      expect(result.jobs[0].payload.correlationId).toBe(TEST_CORRELATION_ID);
    });
  });

  describe("scenariusz PARTIAL_SUCCESS", () => {
    beforeEach(() => {
      process.env.LAB_SIMULATOR_SCENARIO = "PARTIAL_SUCCESS";
      process.env.LAB_SIMULATOR_DELAY_MS = "1000";
    });

    it("planuje dokładnie dwa zadania dla zlecenia z co najmniej dwoma badaniami", () => {
      const result = service.acceptOrder(buildInput(2));
      expect(result.jobs).toHaveLength(2);
    });

    it("pierwszy callback ma status PARTIAL i niepusty właściwy podzbiór wyników", () => {
      const result = service.acceptOrder(buildInput(2));
      const [first] = result.jobs;

      expect(first.scenario).toBe("PARTIAL_SUCCESS");
      expect(first.payload.status).toBe("PARTIAL");
      expect(first.payload.results.length).toBeGreaterThan(0);
      expect(first.payload.results.length).toBeLessThan(2);
      expect(first.payload.pendingMedicalTestIds.length).toBeGreaterThan(0);
    });

    it("drugi callback ma status COMPLETED, komplet pozostałych wyników i puste pendingMedicalTestIds", () => {
      const result = service.acceptOrder(buildInput(2));
      const [, second] = result.jobs;

      expect(second.scenario).toBe("PARTIAL_SUCCESS");
      expect(second.payload.status).toBe("COMPLETED");
      expect(second.payload.pendingMedicalTestIds).toEqual([]);
      expect(second.payload.results.length).toBeGreaterThan(0);
    });

    it("oba callbacki razem obejmują dokładnie wszystkie badania zlecenia bez duplikatów", () => {
      const input = buildInput(4);
      const result = service.acceptOrder(input);
      const [first, second] = result.jobs;

      const allResultTestIds = [
        ...first.payload.results.map((r) => r.medicalTestId),
        ...second.payload.results.map((r) => r.medicalTestId)
      ].sort();
      const expectedTestIds = input.tests.map((t) => t.medicalTestId).sort();

      expect(allResultTestIds).toEqual(expectedTestIds);
      expect(first.payload.pendingMedicalTestIds).toEqual(
        second.payload.results.map((r) => r.medicalTestId)
      );
    });

    it("oba callbacki mają unikalne eventId oraz ten sam externalOrderId", () => {
      const result = service.acceptOrder(buildInput(2));
      const [first, second] = result.jobs;

      expect(first.payload.eventId).not.toBe(second.payload.eventId);
      expect(first.payload.externalOrderId).toBe(result.externalOrderId);
      expect(second.payload.externalOrderId).toBe(result.externalOrderId);
    });

    it("oba callbacki mają ten sam correlationId, dokładnie taki jak przekazany do symulatora", () => {
      const result = service.acceptOrder(buildInput(2));
      const [first, second] = result.jobs;

      expect(first.payload.correlationId).not.toBeNull();
      expect(first.payload.correlationId).toBe(TEST_CORRELATION_ID);
      expect(second.payload.correlationId).toBe(TEST_CORRELATION_ID);
      expect(first.payload.correlationId).toBe(second.payload.correlationId);
    });

    it("pierwszy callback jest zaplanowany wcześniej niż callback końcowy", () => {
      const result = service.acceptOrder(buildInput(2));
      const [first, second] = result.jobs;

      expect(first.executeAt.getTime()).toBeLessThan(second.executeAt.getTime());
      expect(second.executeAt).toEqual(result.estimatedCompletionAt);
    });

    it("zachowuje ścisłą kolejność callbacków nawet przy bardzo małym opóźnieniu", () => {
      process.env.LAB_SIMULATOR_DELAY_MS = "1";
      const result = service.acceptOrder(buildInput(2));
      const [first, second] = result.jobs;

      expect(first.executeAt.getTime()).toBeLessThan(second.executeAt.getTime());
    });

    it("stosuje deterministyczny podział badań niezależny od kolejności wejściowej", () => {
      const input = buildInput(3);
      const reversedInput: LabSimulatorOrderInput = {
        ...input,
        tests: [...input.tests].reverse()
      };

      const result = service.acceptOrder(input);
      const reversedResult = service.acceptOrder(reversedInput);

      const testIdsOf = (jobResults: typeof result.jobs) =>
        jobResults.map((job) => job.payload.results.map((r) => r.medicalTestId).sort());

      expect(testIdsOf(result.jobs)).toEqual(testIdsOf(reversedResult.jobs));
    });

    it("stosuje jawny fallback do scenariusza SUCCESS dla zlecenia z jednym badaniem", () => {
      const result = service.acceptOrder(buildInput(1));

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].scenario).toBe("SUCCESS");
      expect(result.jobs[0].payload.status).toBe("COMPLETED");
      expect(result.jobs[0].payload.pendingMedicalTestIds).toEqual([]);
      expect(result.jobs[0].payload.results).toHaveLength(1);
      expect(result.jobs[0].payload.results[0].parameters).toHaveLength(1);
      expect(result.jobs[0].payload.correlationId).not.toBeNull();
      expect(result.jobs[0].payload.correlationId).toBe(TEST_CORRELATION_ID);
    });
  });

  describe("scenariusz SAMPLE_REJECTED", () => {
    beforeEach(() => {
      process.env.LAB_SIMULATOR_SCENARIO = "SAMPLE_REJECTED";
      process.env.LAB_SIMULATOR_DELAY_MS = "1000";
    });

    it("planuje dokładnie jedno zadanie z terminalnym callbackiem REJECTED", () => {
      const result = service.acceptOrder(buildMultiMaterialInput());

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].scenario).toBe("SAMPLE_REJECTED");
      expect(result.jobs[0].payload.status).toBe("REJECTED");
      expect(result.jobs[0].payload.pendingMedicalTestIds).toEqual([]);
      expect(result.jobs[0].executeAt).toEqual(result.estimatedCompletionAt);
    });

    it("odrzuca jedyną próbkę zlecenia i nie generuje wtedy żadnych wyników", () => {
      const result = service.acceptOrder(buildInput(2));
      const payload = result.jobs[0].payload;

      expect(payload.status).toBe("REJECTED");
      expect(payload.results).toEqual([]);
      expect(payload.rejectedSamples).toEqual([
        {
          sampleId: "sample-serum",
          rejectionCode: "INSUFFICIENT_VOLUME",
          rejectionReason: "Niewystarczająca objętość próbki"
        }
      ]);
    });

    it("odrzuca dokładnie jedną z wielu próbek", () => {
      const result = service.acceptOrder(buildMultiMaterialInput());

      expect(result.jobs[0].payload.rejectedSamples).toHaveLength(1);
    });

    it("wybiera próbkę deterministycznie, niezależnie od kolejności wejściowej", () => {
      const input = buildMultiMaterialInput();
      const reversed: LabSimulatorOrderInput = {
        ...input,
        samples: [...input.samples].reverse(),
        tests: [...input.tests].reverse()
      };

      const first = service.acceptOrder(input);
      const second = service.acceptOrder(reversed);

      expect(first.jobs[0].payload.rejectedSamples).toEqual(
        second.jobs[0].payload.rejectedSamples
      );
      // Stabilne sortowanie po rodzaju materiału: pierwsza jest krew EDTA.
      expect(first.jobs[0].payload.rejectedSamples?.[0].sampleId).toBe("sample-blood");
    });

    it("generuje wyniki wyłącznie dla badań z nieodrzuconych materiałów", () => {
      const result = service.acceptOrder(buildMultiMaterialInput());
      const payload = result.jobs[0].payload;

      expect(payload.results.map((r) => r.medicalTestId).sort()).toEqual([
        "test-crp",
        "test-urine"
      ]);
      expect(payload.results.every((r) => r.parameters.length > 0)).toBe(true);
    });

    it("przypisuje deterministyczny kod i opis odrzucenia wg rodzaju materiału", () => {
      const result = service.acceptOrder(buildMultiMaterialInput());

      expect(result.jobs[0].payload.rejectedSamples?.[0]).toEqual({
        sampleId: "sample-blood",
        rejectionCode: "HEMOLYZED",
        rejectionReason: "Próbka zhemolizowana"
      });
    });

    it("propaguje externalOrderId i correlationId do payloadu callbacka", () => {
      const result = service.acceptOrder(buildMultiMaterialInput());
      const payload = result.jobs[0].payload;

      expect(payload.externalOrderId).toBe(result.externalOrderId);
      expect(payload.eventId).toEqual(expect.any(String));
      expect(payload.correlationId).not.toBeNull();
      expect(payload.correlationId).toBe(TEST_CORRELATION_ID);
    });

    it("stosuje jawny fallback do SUCCESS, gdy zlecenie nie ma żadnej próbki", () => {
      const input: LabSimulatorOrderInput = { ...buildInput(1), samples: [] };
      const result = service.acceptOrder(input);

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].scenario).toBe("SUCCESS");
      expect(result.jobs[0].payload.status).toBe("COMPLETED");
    });
  });

  it("rzuca czytelny błąd dla nieprawidłowej wartości LAB_SIMULATOR_SCENARIO", () => {
    process.env.LAB_SIMULATOR_SCENARIO = "NOT_A_SCENARIO";
    expect(() => service.acceptOrder(buildInput(2))).toThrow(/LAB_SIMULATOR_SCENARIO/);
  });
});
