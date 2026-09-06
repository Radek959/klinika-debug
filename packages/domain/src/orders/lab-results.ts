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
  return hash / 0xffffffff;
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

export type OrderTestCompletionStatus = "PENDING" | "COMPLETED";

export function determineOrderStatusAfterResults(
  testStatuses: OrderTestCompletionStatus[]
): "PARTIAL" | "COMPLETED" {
  return testStatuses.every((status) => status === "COMPLETED")
    ? "COMPLETED"
    : "PARTIAL";
}
