import {
  canEditDraftOrder,
  getDraftOrderChangeSet,
  hasDraftOrderChanges,
  mergeDraftOrderPatch,
  validateDraftOrderPatchHasChanges,
  type DraftOrderState
} from "./order-draft-edit";

const current: DraftOrderState = {
  patientId: "patient-1",
  priority: "ROUTINE",
  tests: [
    { medicalTestId: "test-crp", additionalData: null },
    { medicalTestId: "test-glu", additionalData: { PATIENT_PREPARED: false } }
  ]
};

describe("edycja zlecenia DRAFT", () => {
  it("pozwala edytować wyłącznie status DRAFT", () => {
    expect(canEditDraftOrder("DRAFT")).toBe(true);
    expect(canEditDraftOrder("SAMPLE_COLLECTED")).toBe(false);
  });

  it("scala częściowy PATCH z istniejącym stanem", () => {
    expect(mergeDraftOrderPatch(current, { priority: "URGENT" })).toEqual({
      ...current,
      priority: "URGENT"
    });
  });

  it("rozpoznaje zmianę samego priorytetu", () => {
    const next = mergeDraftOrderPatch(current, { priority: "URGENT" });
    expect(getDraftOrderChangeSet(current, next)).toEqual({
      patientChanged: false,
      priorityChanged: true,
      testsChanged: false
    });
  });

  it("rozpoznaje zmianę pacjenta", () => {
    const next = mergeDraftOrderPatch(current, { patientId: "patient-2" });
    expect(getDraftOrderChangeSet(current, next).patientChanged).toBe(true);
  });

  it("rozpoznaje zastąpienie, dodanie i usunięcie badania", () => {
    const next = mergeDraftOrderPatch(current, {
      tests: [
        { medicalTestId: "test-glu", additionalData: { PATIENT_PREPARED: false } },
        { medicalTestId: "test-urine", additionalData: null }
      ]
    });
    expect(getDraftOrderChangeSet(current, next).testsChanged).toBe(true);
  });

  it("rozpoznaje aktualizację danych dodatkowych i zachowuje false", () => {
    const unchanged = mergeDraftOrderPatch(current, {
      tests: [
        { medicalTestId: "test-glu", additionalData: { PATIENT_PREPARED: false } },
        { medicalTestId: "test-crp", additionalData: null }
      ]
    });
    expect(getDraftOrderChangeSet(current, unchanged).testsChanged).toBe(false);

    const changed = mergeDraftOrderPatch(current, {
      tests: [
        { medicalTestId: "test-crp", additionalData: null },
        { medicalTestId: "test-glu", additionalData: { PATIENT_PREPARED: true } }
      ]
    });
    expect(getDraftOrderChangeSet(current, changed).testsChanged).toBe(true);
  });

  it("nie traktuje kolejności właściwości additionalData jako zmiany", () => {
    const state: DraftOrderState = {
      patientId: "patient-1",
      priority: "ROUTINE",
      tests: [
        { medicalTestId: "test-a", additionalData: { A: true, B: "tekst" } }
      ]
    };
    const next = mergeDraftOrderPatch(state, {
      tests: [
        { medicalTestId: "test-a", additionalData: { B: "tekst", A: true } }
      ]
    });

    expect(hasDraftOrderChanges(getDraftOrderChangeSet(state, next))).toBe(false);
  });

  it("rozpoznaje request bez rzeczywistej zmiany", () => {
    expect(validateDraftOrderPatchHasChanges(current, current)).toEqual([
      { field: "body", code: "NO_CHANGES" }
    ]);
  });
});
