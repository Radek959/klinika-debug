import {
  buildLabOrderAcceptedDetails,
  buildLabOrderRejectedDetails,
  buildLabRateLimitReceivedDetails,
  buildLabResultReceivedDetails,
  buildLabSampleRejectedDetails,
  buildLabSendRetryDetails,
  buildOrderCreatedDetails,
  buildOrderSentToLabDetails,
  buildOrderUpdatedDetails,
  buildSampleRegisteredDetails,
  diffTestCodes
} from "./order-history";

describe("historia zlecenia — budowanie zdarzeń", () => {
  it("buduje szczegóły utworzenia zlecenia", () => {
    const details = buildOrderCreatedDetails({
      priority: "URGENT",
      testCodes: ["GLU", "CRP"],
      requiredMaterials: ["SERUM"],
      finalStatus: "DRAFT"
    });

    expect(details).toEqual({
      priority: "URGENT",
      testCodes: ["CRP", "GLU"],
      requiredMaterials: ["SERUM"],
      finalStatus: "DRAFT"
    });
  });

  it("nie zawiera danych pacjenta w szczegółach utworzenia", () => {
    const details = buildOrderCreatedDetails({
      priority: "ROUTINE",
      testCodes: ["CRP"],
      requiredMaterials: ["SERUM"],
      finalStatus: "DRAFT"
    });

    expect(JSON.stringify(details)).not.toMatch(/patient/i);
    expect(JSON.stringify(details)).not.toMatch(/pesel/i);
  });

  it("wykrywa dodane i usunięte badania podczas edycji", () => {
    expect(diffTestCodes(["CRP", "GLU"], ["GLU", "MORF"])).toEqual({
      added: ["MORF"],
      removed: ["CRP"]
    });
  });

  it("nie zgłasza zmiany badań, gdy lista jest identyczna", () => {
    expect(diffTestCodes(["CRP", "GLU"], ["GLU", "CRP"])).toEqual({
      added: [],
      removed: []
    });
  });

  it("buduje szczegóły edycji z listą zmienionych obszarów", () => {
    const details = buildOrderUpdatedDetails({
      patientChanged: true,
      priorityChanged: true,
      previousPriority: "ROUTINE",
      newPriority: "URGENT",
      previousTestCodes: ["CRP"],
      nextTestCodes: ["CRP", "GLU"]
    });

    expect(details).toEqual({
      changedFields: ["patientId", "priority", "tests"],
      patientChanged: true,
      previousPriority: "ROUTINE",
      newPriority: "URGENT",
      addedTestCodes: ["GLU"],
      removedTestCodes: []
    });
  });

  it("nie ujawnia danych osobowych pacjenta przy zmianie pacjenta", () => {
    const details = buildOrderUpdatedDetails({
      patientChanged: true,
      priorityChanged: false,
      previousPriority: "ROUTINE",
      newPriority: "ROUTINE",
      previousTestCodes: ["CRP"],
      nextTestCodes: ["CRP"]
    });

    expect(details.patientChanged).toBe(true);
    expect(details).not.toHaveProperty("patientId");
    expect(details).not.toHaveProperty("previousPatientId");
    expect(details).not.toHaveProperty("newPatientId");
  });

  it("pomija zmianę priorytetu w szczegółach, gdy priorytet się nie zmienił", () => {
    const details = buildOrderUpdatedDetails({
      patientChanged: false,
      priorityChanged: false,
      previousPriority: "ROUTINE",
      newPriority: "ROUTINE",
      previousTestCodes: ["CRP"],
      nextTestCodes: ["CRP"]
    });

    expect(details.changedFields).toEqual([]);
    expect(details).not.toHaveProperty("previousPriority");
    expect(details).not.toHaveProperty("newPriority");
  });

  it("buduje szczegóły rejestracji próbki z przejściem statusu", () => {
    const details = buildSampleRegisteredDetails({
      materialType: "SERUM",
      sampleId: "sample-1",
      previousOrderStatus: "DRAFT",
      newOrderStatus: "SAMPLE_COLLECTED"
    });

    expect(details).toEqual({
      materialType: "SERUM",
      sampleId: "sample-1",
      previousOrderStatus: "DRAFT",
      newOrderStatus: "SAMPLE_COLLECTED"
    });
  });

  it("buduje szczegóły wysyłki do laboratorium z kluczem idempotencji", () => {
    const details = buildOrderSentToLabDetails({
      idempotencyKey: "send-order-1",
      correlationId: "corr-1",
      previousStatus: "SAMPLE_COLLECTED",
      newStatus: "SENT_TO_LAB"
    });

    expect(details).toEqual({
      idempotencyKey: "send-order-1",
      correlationId: "corr-1",
      previousStatus: "SAMPLE_COLLECTED",
      newStatus: "SENT_TO_LAB"
    });
  });

  it("buduje szczegóły synchronicznego przyjęcia przez laboratorium", () => {
    const details = buildLabOrderAcceptedDetails({
      externalOrderId: "EXT-1",
      estimatedCompletionAt: "2026-09-07T10:00:00.000Z"
    });

    expect(details).toEqual({
      externalOrderId: "EXT-1",
      estimatedCompletionAt: "2026-09-07T10:00:00.000Z"
    });
  });

  it("nie ujawnia aktywnego scenariusza symulatora w szczegółach przyjęcia zlecenia", () => {
    // Historia zlecenia jest widoczna dla uczestnika warsztatu, więc nie może
    // zdradzać, w jakim trybie pracuje symulator laboratorium.
    const details = buildLabOrderAcceptedDetails({
      externalOrderId: "EXT-1",
      estimatedCompletionAt: "2026-09-07T10:00:00.000Z",
      scenario: "SAMPLE_REJECTED"
    } as unknown as Parameters<typeof buildLabOrderAcceptedDetails>[0]);

    expect(Object.keys(details).sort()).toEqual([
      "estimatedCompletionAt",
      "externalOrderId"
    ]);
    expect(JSON.stringify(details)).not.toMatch(/scenario|SAMPLE_REJECTED/i);
  });

  it("buduje bezpieczne szczegóły callbacku bez pełnego payloadu", () => {
    const details = buildLabResultReceivedDetails({
      eventId: "evt-1",
      externalOrderId: "EXT-1",
      callbackStatus: "COMPLETED",
      testCodes: ["GLU", "CRP"],
      resultCount: 3,
      previousStatus: "PROCESSING",
      newStatus: "COMPLETED"
    });

    expect(details).toEqual({
      eventId: "evt-1",
      externalOrderId: "EXT-1",
      callbackStatus: "COMPLETED",
      testCodes: ["CRP", "GLU"],
      resultCount: 3,
      previousStatus: "PROCESSING",
      newStatus: "COMPLETED"
    });
    expect(JSON.stringify(details)).not.toMatch(/parameter|value|unit/i);
  });

  describe("buildLabSampleRejectedDetails", () => {
    const input = {
      eventId: "evt-rejected-1",
      externalOrderId: "EXT-1",
      rejectedSamples: [
        {
          sampleId: "sample-1",
          materialType: "EDTA_BLOOD" as const,
          rejectionCode: "HEMOLYZED",
          rejectionReason: "Próbka zhemolizowana"
        }
      ],
      completedTestCodes: ["URINE", "CRP"],
      rejectedTestCodes: ["MORF"],
      previousStatus: "PROCESSING" as const,
      newStatus: "REJECTED" as const
    };

    it("buduje komplet bezpiecznych szczegółów i sortuje kody badań", () => {
      expect(buildLabSampleRejectedDetails(input)).toEqual({
        eventId: "evt-rejected-1",
        externalOrderId: "EXT-1",
        rejectedSamples: [
          {
            sampleId: "sample-1",
            materialType: "EDTA_BLOOD",
            rejectionCode: "HEMOLYZED",
            rejectionReason: "Próbka zhemolizowana"
          }
        ],
        completedTestCodes: ["CRP", "URINE"],
        rejectedTestCodes: ["MORF"],
        previousStatus: "PROCESSING",
        newStatus: "REJECTED"
      });
    });

    it("zachowuje komplet odrzuconych próbek w stabilnej kolejności", () => {
      // Kontrakt callbacka dopuszcza odrzucenie wielu próbek naraz, a kolejność
      // wpisu nie może zależeć od kolejności elementów w payloadzie.
      const details = buildLabSampleRejectedDetails({
        ...input,
        rejectedSamples: [
          {
            sampleId: "sample-c",
            materialType: "URINE",
            rejectionCode: "INVALID_CONTAINER",
            rejectionReason: "Nieprawidłowy pojemnik na materiał"
          },
          {
            sampleId: "sample-a",
            materialType: "EDTA_BLOOD",
            rejectionCode: "HEMOLYZED",
            rejectionReason: "Próbka zhemolizowana"
          },
          {
            sampleId: "sample-b",
            materialType: "SERUM",
            rejectionCode: "INSUFFICIENT_VOLUME",
            rejectionReason: "Niewystarczająca objętość próbki"
          }
        ]
      });

      expect(details.rejectedSamples.map((sample) => sample.sampleId)).toEqual([
        "sample-a",
        "sample-b",
        "sample-c"
      ]);
      expect(details.rejectedSamples).toHaveLength(3);
    });

    it("nie przepuszcza danych wrażliwych ani pełnego payloadu", () => {
      // Pola spoza kontraktu nie mogą trafić do historii — ani na poziomie
      // szczegółów, ani wewnątrz pozycji listy odrzuconych próbek.
      const contaminatedInput = {
        ...input,
        pesel: "44051401458",
        barcode: "SMP-1",
        payload: { secret: "x" },
        rejectedSamples: [
          {
            ...input.rejectedSamples[0],
            barcode: "SMP-1",
            patientPesel: "44051401458"
          }
        ]
      };
      const details = buildLabSampleRejectedDetails(contaminatedInput);

      const serialized = JSON.stringify(details);
      expect(serialized).not.toMatch(/pesel|barcode|payload|secret/i);
      expect(Object.keys(details).sort()).toEqual(
        [
          "completedTestCodes",
          "eventId",
          "externalOrderId",
          "newStatus",
          "previousStatus",
          "rejectedSamples",
          "rejectedTestCodes"
        ].sort()
      );
      expect(Object.keys(details.rejectedSamples[0]).sort()).toEqual([
        "materialType",
        "rejectionCode",
        "rejectionReason",
        "sampleId"
      ]);
    });
  });

  describe("buildLabOrderRejectedDetails", () => {
    const fieldErrors = [
      {
        field: "tests",
        code: "LAB_TEST_NOT_SUPPORTED",
        message: "Laboratorium nie obsługuje jednego z wybranych badań."
      }
    ];

    it("buduje bezpieczne szczegóły odrzucenia zlecenia", () => {
      const details = buildLabOrderRejectedDetails({ fieldErrors });

      expect(details).toEqual({
        rejectionType: "VALIDATION",
        errorCode: "LAB_ORDER_VALIDATION_ERROR",
        fieldErrors,
        previousStatus: "SAMPLE_COLLECTED",
        newStatus: "SAMPLE_COLLECTED"
      });
    });

    it("nie zmienia statusu zlecenia — oba pola statusu są równe", () => {
      const details = buildLabOrderRejectedDetails({ fieldErrors });

      expect(details.previousStatus).toBe(details.newStatus);
      expect(details.newStatus).toBe("SAMPLE_COLLECTED");
    });

    it("stabilizuje kolejność fieldErrors niezależnie od kolejności wejściowej", () => {
      const unsorted = [
        { field: "tests", code: "B_CODE", message: "Drugi." },
        { field: "samples", code: "A_CODE", message: "Pierwszy." },
        { field: "tests", code: "A_CODE", message: "Trzeci." }
      ];

      const details = buildLabOrderRejectedDetails({ fieldErrors: unsorted });
      const reversed = buildLabOrderRejectedDetails({
        fieldErrors: [...unsorted].reverse()
      });

      expect(details.fieldErrors.map((error) => `${error.field}:${error.code}`)).toEqual([
        "samples:A_CODE",
        "tests:A_CODE",
        "tests:B_CODE"
      ]);
      expect(reversed).toEqual(details);
    });

    it("nie mutuje listy przekazanej na wejściu", () => {
      const input = [
        { field: "tests", code: "B_CODE", message: "Drugi." },
        { field: "samples", code: "A_CODE", message: "Pierwszy." }
      ];
      const snapshot = JSON.stringify(input);

      buildLabOrderRejectedDetails({ fieldErrors: input });

      expect(JSON.stringify(input)).toBe(snapshot);
    });

    it("nie przepuszcza dodatkowych ani wrażliwych pól", () => {
      const details = buildLabOrderRejectedDetails({
        fieldErrors: [
          {
            ...fieldErrors[0],
            pesel: "44051401458",
            barcode: "SMP-1",
            scenario: "VALIDATION_ERROR"
          } as never
        ]
      });

      const serialized = JSON.stringify(details);
      expect(serialized).not.toMatch(/pesel|barcode|scenario/i);
      expect(Object.keys(details).sort()).toEqual([
        "errorCode",
        "fieldErrors",
        "newStatus",
        "previousStatus",
        "rejectionType"
      ]);
      expect(Object.keys(details.fieldErrors[0]).sort()).toEqual([
        "code",
        "field",
        "message"
      ]);
    });

    it("nie zapisuje nazwy aktywnego scenariusza symulatora", () => {
      const serialized = JSON.stringify(buildLabOrderRejectedDetails({ fieldErrors }));

      expect(serialized).not.toContain(':"VALIDATION_ERROR"');
    });
  });

  describe("otrzymanie ograniczenia przepustowości (429)", () => {
    const input = {
      attemptNumber: 1,
      retryAfterSeconds: 15,
      nextRetryAt: new Date("2026-09-07T10:00:15.000Z")
    };

    it("buduje szczegóły zdarzenia bez zmiany statusu zlecenia", () => {
      const details = buildLabRateLimitReceivedDetails(input);

      expect(details).toEqual({
        attemptNumber: 1,
        retryAfterSeconds: 15,
        nextRetryAt: "2026-09-07T10:00:15.000Z",
        // Ograniczenie przepustowości jest przejściowe: status się nie zmienia
        // i zdarzenie nie jest błędem technicznym.
        previousStatus: "SAMPLE_COLLECTED",
        newStatus: "SAMPLE_COLLECTED"
      });
    });

    it("zapisuje termin ponowienia w formacie ISO 8601", () => {
      const details = buildLabRateLimitReceivedDetails(input);

      expect(details.nextRetryAt).toBe(input.nextRetryAt.toISOString());
    });

    it("nie zawiera nazwy scenariusza ani danych wrażliwych", () => {
      const details = buildLabRateLimitReceivedDetails({
        ...input,
        scenario: "RATE_LIMIT",
        pesel: "44051401458",
        barcode: "SMP-1"
      } as never);

      const serialized = JSON.stringify(details);
      expect(serialized).not.toMatch(/pesel|barcode|scenario/i);
      expect(serialized).not.toContain("RATE_LIMIT");
      expect(Object.keys(details).sort()).toEqual([
        "attemptNumber",
        "newStatus",
        "nextRetryAt",
        "previousStatus",
        "retryAfterSeconds"
      ]);
    });
  });

  describe("automatyczne ponowienie wysyłki", () => {
    it("buduje szczegóły udanego ponowienia z przejściem statusu", () => {
      const details = buildLabSendRetryDetails({ attemptNumber: 2 });

      expect(details).toEqual({
        attemptNumber: 2,
        outcome: "ACCEPTED",
        previousStatus: "SAMPLE_COLLECTED",
        newStatus: "SENT_TO_LAB"
      });
    });

    it("nie przepuszcza dodatkowych ani wrażliwych pól", () => {
      const details = buildLabSendRetryDetails({
        attemptNumber: 2,
        scenario: "RATE_LIMIT",
        pesel: "44051401458"
      } as never);

      const serialized = JSON.stringify(details);
      expect(serialized).not.toMatch(/pesel|scenario/i);
      expect(serialized).not.toContain("RATE_LIMIT");
      expect(Object.keys(details).sort()).toEqual([
        "attemptNumber",
        "newStatus",
        "outcome",
        "previousStatus"
      ]);
    });
  });
});
