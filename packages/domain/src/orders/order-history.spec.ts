import {
  buildLabOrderAcceptedDetails,
  buildLabResultReceivedDetails,
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
      estimatedCompletionAt: "2026-09-07T10:00:00.000Z",
      scenario: "SUCCESS"
    });

    expect(details).toEqual({
      externalOrderId: "EXT-1",
      estimatedCompletionAt: "2026-09-07T10:00:00.000Z",
      scenario: "SUCCESS"
    });
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
});
