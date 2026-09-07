export const LAB_SIMULATOR_SCENARIOS = [
  "SUCCESS",
  "PARTIAL_SUCCESS",
  "SAMPLE_REJECTED",
  "VALIDATION_ERROR",
  "RATE_LIMIT",
  "SERVER_ERROR",
  "TIMEOUT"
] as const;

export type LabSimulatorScenario = (typeof LAB_SIMULATOR_SCENARIOS)[number];

const DEFAULT_LAB_SIMULATOR_SCENARIO: LabSimulatorScenario = "SUCCESS";

/**
 * Odczyt aktywnego scenariusza symulatora laboratorium.
 *
 * Dziś jedynym źródłem jest zmienna środowiskowa `LAB_SIMULATOR_SCENARIO`,
 * obowiązująca globalnie dla wszystkich workspace'ów (zgodnie ze wspólnym
 * stanem środowiska opisanym w architekturze technicznej). Funkcja jest
 * celowo wydzielona, aby w przyszłości zastąpić ten odczyt globalną
 * konfiguracją zapisaną przez panel `/admin`, bez zmiany miejsc wywołania.
 *
 * Brak wartości oznacza domyślny scenariusz `SUCCESS`. Nieprawidłowa,
 * niepusta wartość nie jest cicho akceptowana — funkcja rzuca błąd.
 */
export function resolveLabSimulatorScenario(
  rawValue: string | undefined = process.env.LAB_SIMULATOR_SCENARIO
): LabSimulatorScenario {
  const value = rawValue?.trim();

  if (!value) {
    return DEFAULT_LAB_SIMULATOR_SCENARIO;
  }

  if (!isLabSimulatorScenario(value)) {
    throw new Error(
      `LAB_SIMULATOR_SCENARIO ma nieprawidłową wartość: "${value}". Dozwolone wartości: ${LAB_SIMULATOR_SCENARIOS.join(", ")}.`
    );
  }

  return value;
}

function isLabSimulatorScenario(value: string): value is LabSimulatorScenario {
  return (LAB_SIMULATOR_SCENARIOS as readonly string[]).includes(value);
}
