import {
  planSampleRejection,
  resolveSampleRejectionReason,
  selectSampleToReject,
  SAMPLE_REJECTION_REASONS
} from "./lab-sample-rejection";

describe("lab-sample-rejection", () => {
  describe("resolveSampleRejectionReason", () => {
    it("przypisuje deterministyczny kod i opis dla każdego rodzaju materiału", () => {
      expect(resolveSampleRejectionReason("EDTA_BLOOD")).toEqual({
        rejectionCode: "HEMOLYZED",
        rejectionReason: "Próbka zhemolizowana"
      });
      expect(resolveSampleRejectionReason("SERUM")).toEqual({
        rejectionCode: "INSUFFICIENT_VOLUME",
        rejectionReason: "Niewystarczająca objętość próbki"
      });
      expect(resolveSampleRejectionReason("URINE")).toEqual({
        rejectionCode: "INVALID_CONTAINER",
        rejectionReason: "Nieprawidłowy pojemnik na materiał"
      });
    });

    it("zwraca ten sam wynik przy każdym wywołaniu", () => {
      expect(resolveSampleRejectionReason("SERUM")).toEqual(
        resolveSampleRejectionReason("SERUM")
      );
    });

    it("nie zawiera w opisie diagnozy ani danych pacjenta", () => {
      for (const reason of Object.values(SAMPLE_REJECTION_REASONS)) {
        expect(reason.rejectionReason).not.toMatch(/pacjent|PESEL|rozpozna|zalec/i);
        expect(reason.rejectionCode).toMatch(/^[A-Z_]+$/);
      }
    });
  });

  describe("selectSampleToReject", () => {
    it("wybiera pierwszą próbkę wg stabilnego sortowania po rodzaju materiału", () => {
      const selected = selectSampleToReject([
        { sampleId: "s-urine", materialType: "URINE" },
        { sampleId: "s-serum", materialType: "SERUM" },
        { sampleId: "s-blood", materialType: "EDTA_BLOOD" }
      ]);

      expect(selected.sampleId).toBe("s-blood");
    });

    it("nie zależy od kolejności wejściowej", () => {
      const samples = [
        { sampleId: "s-serum", materialType: "SERUM" as const },
        { sampleId: "s-urine", materialType: "URINE" as const }
      ];

      expect(selectSampleToReject(samples)).toEqual(
        selectSampleToReject([...samples].reverse())
      );
    });

    it("rozstrzyga remis po identyfikatorze próbki", () => {
      const selected = selectSampleToReject([
        { sampleId: "s-b", materialType: "SERUM" },
        { sampleId: "s-a", materialType: "SERUM" }
      ]);

      expect(selected.sampleId).toBe("s-a");
    });

    it("rzuca czytelny błąd dla zlecenia bez próbek", () => {
      expect(() => selectSampleToReject([])).toThrow(/co najmniej jednej próbki/);
    });
  });

  describe("planSampleRejection", () => {
    it("odrzuca jedyną próbkę i nie pozostawia badań do wykonania", () => {
      const plan = planSampleRejection({
        samples: [{ sampleId: "s-serum", materialType: "SERUM" }],
        tests: [
          { medicalTestId: "t-crp", materialType: "SERUM" },
          { medicalTestId: "t-tsh", materialType: "SERUM" }
        ]
      });

      expect(plan.rejectedSampleId).toBe("s-serum");
      expect(plan.rejectionCode).toBe("INSUFFICIENT_VOLUME");
      expect(plan.rejectedMedicalTestIds).toEqual(["t-crp", "t-tsh"]);
      expect(plan.completedMedicalTestIds).toEqual([]);
      expect(plan.acceptedSampleIds).toEqual([]);
    });

    it("odrzuca dokładnie jedną z wielu próbek i wykonuje pozostałe badania", () => {
      const plan = planSampleRejection({
        samples: [
          { sampleId: "s-serum", materialType: "SERUM" },
          { sampleId: "s-blood", materialType: "EDTA_BLOOD" },
          { sampleId: "s-urine", materialType: "URINE" }
        ],
        tests: [
          { medicalTestId: "t-morf", materialType: "EDTA_BLOOD" },
          { medicalTestId: "t-crp", materialType: "SERUM" },
          { medicalTestId: "t-urine", materialType: "URINE" }
        ]
      });

      expect(plan.rejectedSampleId).toBe("s-blood");
      expect(plan.rejectedMaterialType).toBe("EDTA_BLOOD");
      expect(plan.rejectedMedicalTestIds).toEqual(["t-morf"]);
      expect(plan.completedMedicalTestIds).toEqual(["t-crp", "t-urine"]);
      expect(plan.acceptedSampleIds).toEqual(["s-serum", "s-urine"]);
    });

    it("odrzuca wszystkie badania korzystające z odrzuconego materiału", () => {
      const plan = planSampleRejection({
        samples: [
          { sampleId: "s-serum", materialType: "SERUM" },
          { sampleId: "s-blood", materialType: "EDTA_BLOOD" }
        ],
        tests: [
          { medicalTestId: "t-crp", materialType: "SERUM" },
          { medicalTestId: "t-tsh", materialType: "SERUM" },
          { medicalTestId: "t-morf", materialType: "EDTA_BLOOD" }
        ]
      });

      expect(plan.rejectedMedicalTestIds).toEqual(["t-morf"]);
      expect(plan.completedMedicalTestIds).toEqual(["t-crp", "t-tsh"]);
    });

    it("nie oznacza jako zaakceptowanej próbki, z której nie wykonano badania", () => {
      const plan = planSampleRejection({
        samples: [
          { sampleId: "s-blood", materialType: "EDTA_BLOOD" },
          { sampleId: "s-urine", materialType: "URINE" }
        ],
        tests: [{ medicalTestId: "t-morf", materialType: "EDTA_BLOOD" }]
      });

      expect(plan.rejectedSampleId).toBe("s-blood");
      expect(plan.acceptedSampleIds).toEqual([]);
      expect(plan.completedMedicalTestIds).toEqual([]);
    });

    it("jest deterministyczny — ten sam wejściowy zestaw daje ten sam plan", () => {
      const input = {
        samples: [
          { sampleId: "s-serum", materialType: "SERUM" as const },
          { sampleId: "s-blood", materialType: "EDTA_BLOOD" as const }
        ],
        tests: [
          { medicalTestId: "t-crp", materialType: "SERUM" as const },
          { medicalTestId: "t-morf", materialType: "EDTA_BLOOD" as const }
        ]
      };

      expect(planSampleRejection(input)).toEqual(
        planSampleRejection({
          samples: [...input.samples].reverse(),
          tests: [...input.tests].reverse()
        })
      );
    });
  });
});
