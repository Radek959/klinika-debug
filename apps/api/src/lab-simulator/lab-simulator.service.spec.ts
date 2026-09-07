import {
  LabSimulatorService,
  type LabSimulatorOrderAccepted,
  type LabSimulatorOrderInput,
  type LabSimulatorOrderRateLimited,
  type LabSimulatorOrderRejected,
  type LabSimulatorOrderServerError
} from "./lab-simulator.service";

const ORIGINAL_ENV = { ...process.env };
const TEST_CORRELATION_ID = "correlation-order-1-send";

/**
 * Zawęża wynik symulatora do wariantu przyjętego. Scenariusze asynchroniczne
 * zawsze przyjmują zlecenie, więc test, który tego nie dostanie, powinien paść
 * z czytelnym komunikatem, a nie na dostępie do brakującego pola.
 */
function acceptAccepted(
  service: LabSimulatorService,
  input: LabSimulatorOrderInput
): LabSimulatorOrderAccepted {
  const result = service.acceptOrder(input);
  if (!result.accepted) {
    throw new Error("Oczekiwano przyjęcia zlecenia przez symulator laboratorium.");
  }
  return result;
}

/** Zawęża wynik symulatora do wariantu odrzuconego walidacyjnie. */
function acceptRejected(
  service: LabSimulatorService,
  input: LabSimulatorOrderInput
): LabSimulatorOrderRejected {
  const result = service.acceptOrder(input);
  if (result.accepted) {
    throw new Error("Oczekiwano odrzucenia zlecenia przez symulator laboratorium.");
  }
  if (result.rejectionType !== "VALIDATION") {
    throw new Error("Oczekiwano odrzucenia walidacyjnego, a nie ograniczenia przepustowości.");
  }
  return result;
}

/** Zawęża wynik symulatora do wariantu ograniczenia przepustowości (429). */
function acceptRateLimited(
  service: LabSimulatorService,
  input: LabSimulatorOrderInput
): LabSimulatorOrderRateLimited {
  const result = service.acceptOrder(input);
  if (result.accepted) {
    throw new Error("Oczekiwano ograniczenia przepustowości przez symulator laboratorium.");
  }
  if (result.rejectionType !== "RATE_LIMIT") {
    throw new Error("Oczekiwano ograniczenia przepustowości, a nie odrzucenia walidacyjnego.");
  }
  return result;
}

/** Zawęża wynik symulatora do kontrolowanego błędu 5xx laboratorium. */
function acceptServerError(
  service: LabSimulatorService,
  input: LabSimulatorOrderInput
): LabSimulatorOrderServerError {
  const result = service.acceptOrder(input);
  if (result.accepted) {
    throw new Error("Oczekiwano kontrolowanego błędu serwera laboratorium.");
  }
  if (result.rejectionType !== "SERVER_ERROR") {
    throw new Error("Oczekiwano błędu serwera laboratorium.");
  }
  return result;
}

function buildInput(testCount: number): LabSimulatorOrderInput {
  // Wszystkie badania w tym wariancie korzystają z tego samego materiału, więc
  // zlecenie ma dokładnie jedną próbkę.
  return {
    workspaceId: "workspace-1",
    orderId: "order-1",
    correlationId: TEST_CORRELATION_ID,
    tests: Array.from({ length: testCount }, (_, index) => ({
      medicalTestId: `test-${index}`,
      code: `CODE-${index}`,
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
        code: "MORF",
        materialType: "EDTA_BLOOD" as const,
        parameters: [{ code: "HGB", valueType: "NUMERIC" as const, unit: "g/dL" }]
      },
      {
        medicalTestId: "test-crp",
        code: "CRP",
        materialType: "SERUM" as const,
        parameters: [{ code: "CRP", valueType: "NUMERIC" as const, unit: "mg/L" }]
      },
      {
        medicalTestId: "test-urine",
        code: "URINE",
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

      const result = acceptAccepted(service,input);

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
      const result = acceptAccepted(service,buildInput(3));

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].scenario).toBe("SUCCESS");
      expect(result.jobs[0].payload.status).toBe("COMPLETED");
      expect(result.jobs[0].payload.results).toHaveLength(3);
    });

    it("ustawia w callbacku correlationId przekazany do symulatora, a nie null", () => {
      delete process.env.LAB_SIMULATOR_SCENARIO;
      const result = acceptAccepted(service,buildInput(2));

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
      const result = acceptAccepted(service,buildInput(2));
      expect(result.jobs).toHaveLength(2);
    });

    it("pierwszy callback ma status PARTIAL i niepusty właściwy podzbiór wyników", () => {
      const result = acceptAccepted(service,buildInput(2));
      const [first] = result.jobs;

      expect(first.scenario).toBe("PARTIAL_SUCCESS");
      expect(first.payload.status).toBe("PARTIAL");
      expect(first.payload.results.length).toBeGreaterThan(0);
      expect(first.payload.results.length).toBeLessThan(2);
      expect(first.payload.pendingMedicalTestIds.length).toBeGreaterThan(0);
    });

    it("drugi callback ma status COMPLETED, komplet pozostałych wyników i puste pendingMedicalTestIds", () => {
      const result = acceptAccepted(service,buildInput(2));
      const [, second] = result.jobs;

      expect(second.scenario).toBe("PARTIAL_SUCCESS");
      expect(second.payload.status).toBe("COMPLETED");
      expect(second.payload.pendingMedicalTestIds).toEqual([]);
      expect(second.payload.results.length).toBeGreaterThan(0);
    });

    it("oba callbacki razem obejmują dokładnie wszystkie badania zlecenia bez duplikatów", () => {
      const input = buildInput(4);
      const result = acceptAccepted(service,input);
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
      const result = acceptAccepted(service,buildInput(2));
      const [first, second] = result.jobs;

      expect(first.payload.eventId).not.toBe(second.payload.eventId);
      expect(first.payload.externalOrderId).toBe(result.externalOrderId);
      expect(second.payload.externalOrderId).toBe(result.externalOrderId);
    });

    it("oba callbacki mają ten sam correlationId, dokładnie taki jak przekazany do symulatora", () => {
      const result = acceptAccepted(service,buildInput(2));
      const [first, second] = result.jobs;

      expect(first.payload.correlationId).not.toBeNull();
      expect(first.payload.correlationId).toBe(TEST_CORRELATION_ID);
      expect(second.payload.correlationId).toBe(TEST_CORRELATION_ID);
      expect(first.payload.correlationId).toBe(second.payload.correlationId);
    });

    it("pierwszy callback jest zaplanowany wcześniej niż callback końcowy", () => {
      const result = acceptAccepted(service,buildInput(2));
      const [first, second] = result.jobs;

      expect(first.executeAt.getTime()).toBeLessThan(second.executeAt.getTime());
      expect(second.executeAt).toEqual(result.estimatedCompletionAt);
    });

    it("zachowuje ścisłą kolejność callbacków nawet przy bardzo małym opóźnieniu", () => {
      process.env.LAB_SIMULATOR_DELAY_MS = "1";
      const result = acceptAccepted(service,buildInput(2));
      const [first, second] = result.jobs;

      expect(first.executeAt.getTime()).toBeLessThan(second.executeAt.getTime());
    });

    it("stosuje deterministyczny podział badań niezależny od kolejności wejściowej", () => {
      const input = buildInput(3);
      const reversedInput: LabSimulatorOrderInput = {
        ...input,
        tests: [...input.tests].reverse()
      };

      const result = acceptAccepted(service,input);
      const reversedResult = acceptAccepted(service,reversedInput);

      const testIdsOf = (jobResults: typeof result.jobs) =>
        jobResults.map((job) => job.payload.results.map((r) => r.medicalTestId).sort());

      expect(testIdsOf(result.jobs)).toEqual(testIdsOf(reversedResult.jobs));
    });

    it("stosuje jawny fallback do scenariusza SUCCESS dla zlecenia z jednym badaniem", () => {
      const result = acceptAccepted(service,buildInput(1));

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
      const result = acceptAccepted(service,buildMultiMaterialInput());

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].scenario).toBe("SAMPLE_REJECTED");
      expect(result.jobs[0].payload.status).toBe("REJECTED");
      expect(result.jobs[0].payload.pendingMedicalTestIds).toEqual([]);
      expect(result.jobs[0].executeAt).toEqual(result.estimatedCompletionAt);
    });

    it("odrzuca jedyną próbkę zlecenia i nie generuje wtedy żadnych wyników", () => {
      const result = acceptAccepted(service,buildInput(2));
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
      const result = acceptAccepted(service,buildMultiMaterialInput());

      expect(result.jobs[0].payload.rejectedSamples).toHaveLength(1);
    });

    it("wybiera próbkę deterministycznie, niezależnie od kolejności wejściowej", () => {
      const input = buildMultiMaterialInput();
      const reversed: LabSimulatorOrderInput = {
        ...input,
        samples: [...input.samples].reverse(),
        tests: [...input.tests].reverse()
      };

      const first = acceptAccepted(service,input);
      const second = acceptAccepted(service,reversed);

      expect(first.jobs[0].payload.rejectedSamples).toEqual(
        second.jobs[0].payload.rejectedSamples
      );
      // Stabilne sortowanie po rodzaju materiału: pierwsza jest krew EDTA.
      expect(first.jobs[0].payload.rejectedSamples?.[0].sampleId).toBe("sample-blood");
    });

    it("generuje wyniki wyłącznie dla badań z nieodrzuconych materiałów", () => {
      const result = acceptAccepted(service,buildMultiMaterialInput());
      const payload = result.jobs[0].payload;

      expect(payload.results.map((r) => r.medicalTestId).sort()).toEqual([
        "test-crp",
        "test-urine"
      ]);
      expect(payload.results.every((r) => r.parameters.length > 0)).toBe(true);
    });

    it("przypisuje deterministyczny kod i opis odrzucenia wg rodzaju materiału", () => {
      const result = acceptAccepted(service,buildMultiMaterialInput());

      expect(result.jobs[0].payload.rejectedSamples?.[0]).toEqual({
        sampleId: "sample-blood",
        rejectionCode: "HEMOLYZED",
        rejectionReason: "Próbka zhemolizowana"
      });
    });

    it("propaguje externalOrderId i correlationId do payloadu callbacka", () => {
      const result = acceptAccepted(service,buildMultiMaterialInput());
      const payload = result.jobs[0].payload;

      expect(payload.externalOrderId).toBe(result.externalOrderId);
      expect(payload.eventId).toEqual(expect.any(String));
      expect(payload.correlationId).not.toBeNull();
      expect(payload.correlationId).toBe(TEST_CORRELATION_ID);
    });

    it("stosuje jawny fallback do SUCCESS, gdy zlecenie nie ma żadnej próbki", () => {
      const input: LabSimulatorOrderInput = { ...buildInput(1), samples: [] };
      const result = acceptAccepted(service,input);

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].scenario).toBe("SUCCESS");
      expect(result.jobs[0].payload.status).toBe("COMPLETED");
    });
  });

  describe("scenariusz VALIDATION_ERROR", () => {
    beforeEach(() => {
      process.env.LAB_SIMULATOR_SCENARIO = "VALIDATION_ERROR";
      process.env.LAB_SIMULATOR_DELAY_MS = "1000";
    });

    it("odrzuca zlecenie zamiast je przyjąć", () => {
      const result = service.acceptOrder(buildInput(2));

      expect(result.accepted).toBe(false);
    });

    it("nie zwraca externalOrderId, estimatedCompletionAt ani zadań do lab_jobs", () => {
      const result = acceptRejected(service, buildMultiMaterialInput());

      expect(result).not.toHaveProperty("externalOrderId");
      expect(result).not.toHaveProperty("estimatedCompletionAt");
      expect(result).not.toHaveProperty("jobs");
    });

    it("zwraca deterministyczny kod, komunikat i błędy pól", () => {
      const result = acceptRejected(service, buildMultiMaterialInput());

      expect(result.rejectionType).toBe("VALIDATION");
      expect(result.errorCode).toBe("LAB_ORDER_VALIDATION_ERROR");
      expect(result.message).toBe(
        "Laboratorium odrzuciło zlecenie z powodu błędów walidacji."
      );
      expect(result.fieldErrors).toEqual([
        {
          field: "tests",
          code: "LAB_TEST_NOT_SUPPORTED",
          message: "Laboratorium nie obsługuje jednego z wybranych badań."
        }
      ]);
    });

    it("daje ten sam wynik dla powtórzonych i różnie posortowanych wywołań", () => {
      const input = buildMultiMaterialInput();
      const reversed: LabSimulatorOrderInput = {
        ...input,
        tests: [...input.tests].reverse(),
        samples: [...input.samples].reverse()
      };

      const first = acceptRejected(service, input);
      const second = acceptRejected(service, input);
      const third = acceptRejected(service, reversed);

      expect(second).toEqual(first);
      expect(third).toEqual(first);
    });

    it("nie ujawnia danych pacjenta, kodów kreskowych ani nazwy scenariusza", () => {
      const serialized = JSON.stringify(
        acceptRejected(service, buildMultiMaterialInput())
      );

      // Kod błędu LAB_ORDER_VALIDATION_ERROR jest kontraktowy; zabroniona jest
      // wyłącznie sama nazwa aktywnego scenariusza jako wartość JSON.
      expect(serialized).not.toContain(':"VALIDATION_ERROR"');
      expect(serialized).not.toContain("scenario");
      expect(serialized).not.toContain("sample-");
      expect(serialized).not.toContain("barcode");
      expect(serialized).not.toContain("pesel");
    });

    it("odrzuca też zlecenie z jednym badaniem i jedną próbką", () => {
      const result = acceptRejected(service, buildInput(1));

      expect(result.fieldErrors).toHaveLength(1);
    });
  });

  describe("scenariusz RATE_LIMIT", () => {
    beforeEach(() => {
      process.env.LAB_SIMULATOR_SCENARIO = "RATE_LIMIT";
    });

    it("zwraca ograniczenie przepustowości dla pierwszej próby", () => {
      const result = acceptRateLimited(service, { ...buildInput(2), attemptNumber: 1 });

      expect(result.accepted).toBe(false);
      expect(result.rejectionType).toBe("RATE_LIMIT");
      expect(result.statusCode).toBe(429);
      expect(result.errorCode).toBe("LAB_RATE_LIMITED");
      expect(result.message).toBe(
        "Laboratorium chwilowo ograniczyło liczbę żądań. Wysyłka zostanie ponowiona automatycznie."
      );
    });

    it("planuje pierwsze ponowienie na 15 sekund i drugą próbę", () => {
      const before = Date.now();
      const result = acceptRateLimited(service, { ...buildInput(2), attemptNumber: 1 });
      const after = Date.now();

      expect(result.retryAfterSeconds).toBe(15);
      expect(result.nextAttemptNumber).toBe(2);
      expect(result.nextRetryAt.getTime()).toBeGreaterThanOrEqual(before + 15_000);
      expect(result.nextRetryAt.getTime()).toBeLessThanOrEqual(after + 15_000);
    });

    it("traktuje brak numeru próby jak pierwszą próbę", () => {
      const result = acceptRateLimited(service, buildInput(2));

      expect(result.rejectionType).toBe("RATE_LIMIT");
      expect(result.nextAttemptNumber).toBe(2);
    });

    it("nie tworzy externalOrderId ani zadania callbacka przy pierwszej próbie", () => {
      const result = acceptRateLimited(service, { ...buildInput(2), attemptNumber: 1 });

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("EXT-");
      expect(serialized).not.toContain("externalOrderId");
      expect(serialized).not.toContain("jobs");
      expect(serialized).not.toContain("estimatedCompletionAt");
    });

    it("przyjmuje drugą próbę tak jak scenariusz SUCCESS", () => {
      const result = acceptAccepted(service, { ...buildInput(2), attemptNumber: 2 });

      expect(result.accepted).toBe(true);
      expect(result.externalOrderId).toEqual(expect.stringMatching(/^EXT-/));
      expect(result.estimatedCompletionAt).toBeInstanceOf(Date);
      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].scenario).toBe("SUCCESS");
      expect(result.jobs[0].payload.status).toBe("COMPLETED");
      expect(result.jobs[0].payload.results).toHaveLength(2);
      expect(result.jobs[0].payload.pendingMedicalTestIds).toEqual([]);
    });

    it("jest deterministyczny: próba 1 odmawia, próba 2 przyjmuje", () => {
      expect(
        acceptRateLimited(service, { ...buildInput(2), attemptNumber: 1 }).rejectionType
      ).toBe("RATE_LIMIT");
      expect(
        acceptRateLimited(service, { ...buildInput(2), attemptNumber: 1 }).rejectionType
      ).toBe("RATE_LIMIT");
      expect(
        acceptAccepted(service, { ...buildInput(2), attemptNumber: 2 }).accepted
      ).toBe(true);
      expect(
        acceptAccepted(service, { ...buildInput(2), attemptNumber: 3 }).accepted
      ).toBe(true);
    });

    it("zachowuje correlationId pierwotnej wysyłki w callbacku ponowienia", () => {
      const result = acceptAccepted(service, { ...buildInput(2), attemptNumber: 2 });

      expect(result.jobs[0].payload.correlationId).toBe(TEST_CORRELATION_ID);
    });

    it("nie ujawnia danych wrażliwych ani nazwy scenariusza", () => {
      const serialized = JSON.stringify(
        acceptRateLimited(service, { ...buildMultiMaterialInput(), attemptNumber: 1 })
      );

      // `rejectionType` jest wewnętrznym dyskryminatorem unii wyniku symulatora,
      // a nie polem kontraktu HTTP — do odpowiedzi API i historii zlecenia trafia
      // wyłącznie kod `LAB_RATE_LIMITED` (sprawdzane w testach e2e).
      expect(serialized).not.toContain("scenario");
      expect(serialized).not.toContain("sample-");
      expect(serialized).not.toContain("barcode");
      expect(serialized).not.toContain("pesel");
      expect(serialized).not.toContain("EXT-");
    });
  });

  describe("scenariusz SERVER_ERROR", () => {
    beforeEach(() => {
      process.env.LAB_SIMULATOR_SCENARIO = "SERVER_ERROR";
    });

    it("zwraca kontrolowany błąd 503 dla pierwszej próby", () => {
      const result = acceptServerError(service, { ...buildInput(2), attemptNumber: 1 });

      expect(result.accepted).toBe(false);
      expect(result.rejectionType).toBe("SERVER_ERROR");
      expect(result.statusCode).toBe(503);
      expect(result.errorCode).toBe("LAB_SERVER_ERROR");
      expect(result.message).toBe(
        "Laboratorium jest chwilowo niedostępne. Wysyłka zostanie ponowiona automatycznie."
      );
    });

    it("planuje trzy kolejne automatyczne próby według harmonogramu 15/30/60", () => {
      expect(
        acceptServerError(service, { ...buildInput(2), attemptNumber: 1 }).nextAttemptNumber
      ).toBe(2);
      expect(
        acceptServerError(service, { ...buildInput(2), attemptNumber: 1 })
          .retryAfterSeconds
      ).toBe(15);
      expect(
        acceptServerError(service, { ...buildInput(2), attemptNumber: 2 })
          .retryAfterSeconds
      ).toBe(30);
      expect(
        acceptServerError(service, { ...buildInput(2), attemptNumber: 3 })
          .retryAfterSeconds
      ).toBe(60);
    });

    it("nie planuje kolejnej próby po trzecim automatycznym ponowieniu", () => {
      const result = acceptServerError(service, { ...buildInput(2), attemptNumber: 4 });

      expect(result.nextAttemptNumber).toBeNull();
      expect(result.nextRetryAt).toBeNull();
      expect(result.retryAfterSeconds).toBeNull();
    });

    it("nie tworzy externalOrderId ani zadania callbacka dla żadnej próby", () => {
      for (const attemptNumber of [1, 2, 3, 4]) {
        const result = acceptServerError(service, {
          ...buildMultiMaterialInput(),
          attemptNumber
        });
        const serialized = JSON.stringify(result);

        expect(serialized).not.toContain("EXT-");
        expect(serialized).not.toContain("externalOrderId");
        expect(serialized).not.toContain("jobs");
        expect(serialized).not.toContain("estimatedCompletionAt");
      }
    });
  });

  describe("scenariusz przekazany jawnie", () => {
    it("ma pierwszeństwo przed globalną konfiguracją", () => {
      // Zadanie ponowienia utrwala scenariusz w chwili powstania, więc zmiana
      // globalnej konfiguracji nie może zamienić go w inny scenariusz.
      process.env.LAB_SIMULATOR_SCENARIO = "VALIDATION_ERROR";

      const result = acceptAccepted(service, {
        ...buildInput(2),
        attemptNumber: 2,
        scenario: "RATE_LIMIT"
      });

      expect(result.accepted).toBe(true);
      expect(result.jobs[0].scenario).toBe("SUCCESS");
    });

    it("nie odczytuje globalnej konfiguracji, gdy scenariusz jest podany", () => {
      process.env.LAB_SIMULATOR_SCENARIO = "NOT_A_SCENARIO";

      expect(() =>
        acceptAccepted(service, {
          ...buildInput(2),
          attemptNumber: 2,
          scenario: "RATE_LIMIT"
        })
      ).not.toThrow();
    });
  });

  describe("brak regresji pozostałych scenariuszy", () => {
    it.each(["SUCCESS", "PARTIAL_SUCCESS", "SAMPLE_REJECTED"])(
      "scenariusz %s nadal przyjmuje zlecenie i tworzy zadania",
      (scenario) => {
        process.env.LAB_SIMULATOR_SCENARIO = scenario;
        const result = acceptAccepted(service, buildMultiMaterialInput());

        expect(result.accepted).toBe(true);
        expect(result.externalOrderId).toEqual(expect.stringMatching(/^EXT-/));
        expect(result.estimatedCompletionAt).toBeInstanceOf(Date);
        expect(result.jobs.length).toBeGreaterThan(0);
      }
    );
  });

  it("rzuca czytelny błąd dla nieprawidłowej wartości LAB_SIMULATOR_SCENARIO", () => {
    process.env.LAB_SIMULATOR_SCENARIO = "NOT_A_SCENARIO";
    expect(() => acceptAccepted(service,buildInput(2))).toThrow(/LAB_SIMULATOR_SCENARIO/);
  });
});
