export type ResultFlag = "LOW" | "NORMAL" | "HIGH" | "NOT_APPLICABLE";

export interface SyntheticParameterDefinition {
  code: string;
  valueType: "NUMERIC" | "TEXT";
  unit: string | null;
}

export interface SyntheticResultValue {
  code: string;
  value: string;
  unit: string | null;
  flag: ResultFlag;
}

const TEXT_VALUE_OPTIONS = ["Słomkowy", "Żółty", "Jasnożółty"];

// Deterministyczny hash tekstu na wartość z przedziału [0, 1), bez zależności od node:crypto.
function hashSeedToUnitInterval(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash / 0x100000000;
}

export function generateSyntheticResult(
  seed: string,
  parameter: SyntheticParameterDefinition
): SyntheticResultValue {
  if (parameter.valueType === "TEXT") {
    const index = Math.floor(
      hashSeedToUnitInterval(seed) * TEXT_VALUE_OPTIONS.length
    );
    return {
      code: parameter.code,
      value: TEXT_VALUE_OPTIONS[index],
      unit: parameter.unit,
      flag: "NOT_APPLICABLE"
    };
  }

  const value = Math.round(hashSeedToUnitInterval(seed) * 100 * 100) / 100;
  return {
    code: parameter.code,
    value: value.toFixed(2),
    unit: parameter.unit,
    flag: "NORMAL"
  };
}

/**
 * Status pojedynczego badania w zleceniu.
 *
 * `REJECTED` oznacza badanie, którego nie da się wykonać, bo laboratorium
 * odrzuciło wymagany dla niego materiał. Jest to poprawne zachowanie
 * biznesowe laboratorium, a nie błąd aplikacji.
 */
export type OrderTestCompletionStatus = "PENDING" | "COMPLETED" | "REJECTED";

/**
 * Wyznacza status zlecenia po odebraniu wyników, które nie odrzucają żadnej
 * próbki. Zlecenie jest `COMPLETED` dopiero wtedy, gdy wszystkie badania mają
 * wynik. Badanie `REJECTED` nigdy nie liczy się jako wykonane — terminalny
 * status zlecenia z odrzuconą próbką wyznacza osobna ścieżka `REJECTED`.
 */
export function determineOrderStatusAfterResults(
  testStatuses: OrderTestCompletionStatus[]
): "PARTIAL" | "COMPLETED" {
  return testStatuses.every((status) => status === "COMPLETED")
    ? "COMPLETED"
    : "PARTIAL";
}

export interface PartialSuccessTestSplit {
  firstBatchTestIds: string[];
  secondBatchTestIds: string[];
}

/**
 * Dzieli badania zlecenia na dwa niepuste podzbiory dla scenariusza symulatora
 * PARTIAL_SUCCESS. Podział jest deterministyczny (sortowanie po medicalTestId),
 * a nie losowy, więc ten sam zestaw badań zawsze daje ten sam podział.
 *
 * Wymaga co najmniej dwóch badań. Dla zlecenia z jednym badaniem nie da się
 * zbudować dwóch niepustych podzbiorów badań (i domyślnie nie dzieli się
 * pojedynczego badania po parametrach) — wywołujący powinien w takim
 * przypadku zastosować jawny fallback do scenariusza SUCCESS zamiast
 * wywoływać tę funkcję.
 */
export function splitMedicalTestIdsForPartialSuccess(
  medicalTestIds: string[]
): PartialSuccessTestSplit {
  if (medicalTestIds.length < 2) {
    throw new Error(
      "Podział na wynik częściowy wymaga co najmniej dwóch badań w zleceniu."
    );
  }

  const sortedIds = [...medicalTestIds].sort();
  const splitIndex = Math.ceil(sortedIds.length / 2);

  return {
    firstBatchTestIds: sortedIds.slice(0, splitIndex),
    secondBatchTestIds: sortedIds.slice(splitIndex)
  };
}

export interface PartialSuccessCallbackOffsets {
  firstCallbackOffsetMs: number;
  finalCallbackOffsetMs: number;
}

/**
 * Wyznacza opóźnienia (od chwili przyjęcia zlecenia) dla pierwszego callbacka
 * z wynikiem częściowym oraz dla callbacka końcowego scenariusza
 * PARTIAL_SUCCESS. `finalCallbackOffsetMs` odpowiada skonfigurowanemu
 * `LAB_SIMULATOR_DELAY_MS` (czas do przewidywanego zakończenia realizacji).
 * Pierwszy callback jest zaplanowany około połowy tego czasu wcześniej.
 *
 * Końcowe opóźnienie jest zawsze co najmniej 1 ms, a pierwsze opóźnienie jest
 * zawsze o co najmniej 1 ms mniejsze — dzięki temu kolejność wykonania
 * callbacków pozostaje deterministyczna nawet przy bardzo małych wartościach
 * `LAB_SIMULATOR_DELAY_MS` używanych w testach.
 */
export function computePartialSuccessCallbackOffsets(
  totalDelayMs: number
): PartialSuccessCallbackOffsets {
  const finalCallbackOffsetMs = Math.max(totalDelayMs, 1);
  const halfOffsetMs = Math.floor(finalCallbackOffsetMs / 2);
  const firstCallbackOffsetMs = Math.min(halfOffsetMs, finalCallbackOffsetMs - 1);

  return { firstCallbackOffsetMs, finalCallbackOffsetMs };
}
