import type { OrderMaterialType } from "./order-creation";

/**
 * Odrzucenie próbki przez laboratorium jest poprawnym zachowaniem biznesowym
 * partnera integracyjnego, a nie kontrolowanym błędem aplikacji. Ten moduł
 * opisuje deterministyczne reguły scenariusza symulatora `SAMPLE_REJECTED`:
 * wybór odrzucanej próbki oraz przypisanie syntetycznej przyczyny odrzucenia.
 */

export interface SampleRejectionReason {
  rejectionCode: string;
  rejectionReason: string;
}

/**
 * Syntetyczne, przewidywalne przyczyny odrzucenia — deterministycznie
 * przypisane do rodzaju materiału. Nie są diagnozą ani zaleceniem medycznym
 * i nie zawierają żadnych danych pacjenta.
 */
export const SAMPLE_REJECTION_REASONS: Record<
  OrderMaterialType,
  SampleRejectionReason
> = {
  EDTA_BLOOD: {
    rejectionCode: "HEMOLYZED",
    rejectionReason: "Próbka zhemolizowana"
  },
  SERUM: {
    rejectionCode: "INSUFFICIENT_VOLUME",
    rejectionReason: "Niewystarczająca objętość próbki"
  },
  URINE: {
    rejectionCode: "INVALID_CONTAINER",
    rejectionReason: "Nieprawidłowy pojemnik na materiał"
  }
};

export function resolveSampleRejectionReason(
  materialType: OrderMaterialType
): SampleRejectionReason {
  return SAMPLE_REJECTION_REASONS[materialType];
}

// Ta sama kolejność materiałów, co w prezentacji próbek zlecenia, dzięki czemu
// wybór odrzucanej próbki jest stabilny i czytelny dla uczestnika warsztatu.
const MATERIAL_ORDER: OrderMaterialType[] = ["EDTA_BLOOD", "SERUM", "URINE"];

export interface SampleRejectionCandidate {
  sampleId: string;
  materialType: OrderMaterialType;
}

export interface SampleRejectionTestInput {
  medicalTestId: string;
  materialType: OrderMaterialType;
}

export interface SampleRejectionPlan {
  rejectedSampleId: string;
  rejectedMaterialType: OrderMaterialType;
  rejectionCode: string;
  rejectionReason: string;
  /** Badania wymagające odrzuconego materiału — nie da się ich wykonać. */
  rejectedMedicalTestIds: string[];
  /** Badania wykonane z nieodrzuconych materiałów — mają komplet wyników. */
  completedMedicalTestIds: string[];
  /** Próbki, z których wykonano badania — laboratorium je zaakceptowało. */
  acceptedSampleIds: string[];
}

/**
 * Wybiera dokładnie jedną próbkę do odrzucenia w sposób deterministyczny:
 * stabilne sortowanie po rodzaju materiału, a przy tym samym materiale po
 * identyfikatorze próbki. Wybierana jest pierwsza próbka wg tego sortowania,
 * więc ten sam zestaw próbek zawsze daje ten sam wynik — bez losowania.
 */
export function selectSampleToReject(
  samples: SampleRejectionCandidate[]
): SampleRejectionCandidate {
  if (samples.length === 0) {
    throw new Error(
      "Wybór próbki do odrzucenia wymaga co najmniej jednej próbki w zleceniu."
    );
  }

  return [...samples].sort(compareSampleCandidates)[0];
}

function compareSampleCandidates(
  left: SampleRejectionCandidate,
  right: SampleRejectionCandidate
): number {
  const byMaterial =
    MATERIAL_ORDER.indexOf(left.materialType) -
    MATERIAL_ORDER.indexOf(right.materialType);
  if (byMaterial !== 0) {
    return byMaterial;
  }
  return left.sampleId.localeCompare(right.sampleId);
}

/**
 * Buduje pełny, deterministyczny plan scenariusza `SAMPLE_REJECTED`:
 * jedna odrzucona próbka, badania zależne od jej materiału oznaczone jako
 * odrzucone, pozostałe badania wykonane, a ich próbki zaakceptowane.
 *
 * Dla zlecenia z jedną próbką lista badań wykonanych i lista zaakceptowanych
 * próbek są puste — nie powstaje wtedy żaden wynik.
 */
export function planSampleRejection(input: {
  samples: SampleRejectionCandidate[];
  tests: SampleRejectionTestInput[];
}): SampleRejectionPlan {
  const rejectedSample = selectSampleToReject(input.samples);
  const reason = resolveSampleRejectionReason(rejectedSample.materialType);

  const rejectedMedicalTestIds = input.tests
    .filter((test) => test.materialType === rejectedSample.materialType)
    .map((test) => test.medicalTestId)
    .sort();
  const completedTests = input.tests.filter(
    (test) => test.materialType !== rejectedSample.materialType
  );
  const completedMedicalTestIds = completedTests
    .map((test) => test.medicalTestId)
    .sort();

  const materialsWithCompletedTests = new Set(
    completedTests.map((test) => test.materialType)
  );
  const acceptedSampleIds = input.samples
    .filter(
      (sample) =>
        sample.sampleId !== rejectedSample.sampleId &&
        materialsWithCompletedTests.has(sample.materialType)
    )
    .map((sample) => sample.sampleId)
    .sort();

  return {
    rejectedSampleId: rejectedSample.sampleId,
    rejectedMaterialType: rejectedSample.materialType,
    rejectionCode: reason.rejectionCode,
    rejectionReason: reason.rejectionReason,
    rejectedMedicalTestIds,
    completedMedicalTestIds,
    acceptedSampleIds
  };
}
