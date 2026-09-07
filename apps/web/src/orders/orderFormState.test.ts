import type { MedicalTestCatalogItem, PatientListItem } from "@klinika/api-contracts";
import { describe, expect, it } from "vitest";
import {
  buildCreateOrderPayload,
  buildUpdateOrderPayload,
  createInitialAdditionalData,
  getMissingRequiredAdditionalFields,
  getRequiredMaterials,
  maskPatientIdentifier,
  sanitizeAdditionalData,
  type SelectedOrderTests
} from "./orderFormState";

const catalog: MedicalTestCatalogItem[] = [
  testCatalogItem({ id: "test-urine", code: "URINE", name: "Badanie ogólne moczu", materialType: "URINE" }),
  testCatalogItem({ id: "test-crp", code: "CRP", name: "CRP", materialType: "SERUM" }),
  testCatalogItem({ id: "test-morf", code: "MORF", name: "Morfologia", materialType: "EDTA_BLOOD" }),
  testCatalogItem({
    id: "test-glu",
    code: "GLU",
    name: "Glukoza",
    materialType: "SERUM",
    requiredFields: [
      {
        code: "fastingConfirmed",
        label: "Pacjent na czczo",
        valueType: "BOOLEAN",
        required: true,
        displayOrder: 1
      },
      {
        code: "note",
        label: "Komentarz",
        valueType: "TEXT",
        required: false,
        displayOrder: 2
      }
    ]
  })
];

describe("stan formularza zlecenia", () => {
  it("inicjuje wymagane pola logiczne wartością false", () => {
    expect(createInitialAdditionalData(catalog[3])).toEqual({ fastingConfirmed: false });
  });

  it("buduje payload z wybranym patientId i zachowuje false jako poprawną wartość", () => {
    const selectedTests: SelectedOrderTests = {
      "test-glu": {
        additionalData: {
          fastingConfirmed: false,
          note: ""
        }
      }
    };

    expect(
      buildCreateOrderPayload({
        patientId: "patient-1",
        priority: "ROUTINE",
        catalog,
        selectedTests
      })
    ).toEqual({
      patientId: "patient-1",
      priority: "ROUTINE",
      tests: [
        {
          medicalTestId: "test-glu",
          additionalData: { fastingConfirmed: false }
        }
      ]
    });
  });

  it("usuwa puste tekstowe dane dodatkowe z payloadu", () => {
    expect(sanitizeAdditionalData({ note: "   ", fastingConfirmed: true })).toEqual({
      fastingConfirmed: true
    });
  });

  it("buduje częściowy PATCH tylko ze zmienionym priorytetem", () => {
    expect(
      buildUpdateOrderPayload({
        initial: {
          patientId: "patient-1",
          priority: "ROUTINE",
          selectedTests: { "test-crp": { additionalData: {} } }
        },
        current: {
          patientId: "patient-1",
          priority: "URGENT",
          selectedTests: { "test-crp": { additionalData: {} } }
        },
        catalog
      })
    ).toEqual({ priority: "URGENT" });
  });

  it("buduje PATCH ze zmianą badań i ignoruje kolejność kluczy additionalData", () => {
    expect(
      buildUpdateOrderPayload({
        initial: {
          patientId: "patient-1",
          priority: "ROUTINE",
          selectedTests: {
            "test-glu": { additionalData: { note: "opis", fastingConfirmed: false } }
          }
        },
        current: {
          patientId: "patient-1",
          priority: "ROUTINE",
          selectedTests: {
            "test-glu": { additionalData: { fastingConfirmed: false, note: "opis" } },
            "test-urine": { additionalData: {} }
          }
        },
        catalog
      })
    ).toEqual({
      tests: [
        {
          medicalTestId: "test-urine"
        },
        {
          medicalTestId: "test-glu",
          additionalData: { fastingConfirmed: false, note: "opis" }
        }
      ]
    });
  });

  it("zwraca null, gdy edycja nie zawiera realnej zmiany", () => {
    expect(
      buildUpdateOrderPayload({
        initial: {
          patientId: "patient-1",
          priority: "ROUTINE",
          selectedTests: { "test-crp": { additionalData: {} } }
        },
        current: {
          patientId: "patient-1",
          priority: "ROUTINE",
          selectedTests: { "test-crp": { additionalData: {} } }
        },
        catalog
      })
    ).toBeNull();
  });

  it("grupuje materiały w stabilnej kolejności domenowej", () => {
    const selectedTests: SelectedOrderTests = {
      "test-urine": { additionalData: {} },
      "test-crp": { additionalData: {} },
      "test-morf": { additionalData: {} },
      "test-glu": { additionalData: { fastingConfirmed: false } }
    };

    expect(getRequiredMaterials(catalog, selectedTests)).toEqual([
      "EDTA_BLOOD",
      "SERUM",
      "URINE"
    ]);
  });

  it("nie traktuje false jako brakującej wartości wymaganego pola logicznego", () => {
    expect(
      getMissingRequiredAdditionalFields(catalog, {
        "test-glu": { additionalData: { fastingConfirmed: false } }
      })
    ).toEqual([]);
  });

  it("maskuje identyfikator pacjenta bez ujawniania pełnego numeru", () => {
    const patient: PatientListItem = {
      id: "patient-1",
      firstName: "Anna",
      lastName: "Nowak",
      identifierType: "PESEL",
      pesel: "44051401458",
      documentType: null,
      documentNumber: null,
      documentCountry: null,
      birthDate: "1990-01-01",
      gender: "FEMALE",
      active: true,
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z"
    };

    expect(maskPatientIdentifier(patient)).toBe("PESEL: ******01458");
  });
});

function testCatalogItem(
  overrides: Partial<MedicalTestCatalogItem> & Pick<MedicalTestCatalogItem, "id" | "code" | "name" | "materialType">
): MedicalTestCatalogItem {
  return {
    description: "Opis badania",
    estimatedDurationMinutes: 5,
    active: true,
    parameters: [],
    requiredFields: [],
    ...overrides
  };
}
