/**
 * Dozwolone presety czasu generowania wyników laboratorium (ms), wybierane
 * globalnie z panelu `/admin`. Ten plik jest jedynym miejscem z listą
 * dozwolonych wartości — panel `/admin` i `WorkshopConfigService` odczytują
 * je stąd, a nie z osobnej, zduplikowanej listy. Wpisanie dowolnej innej
 * wartości (arbitrary value) jest niedozwolone.
 */
export const LAB_DELAY_PRESETS_MS = [5_000, 15_000, 30_000, 60_000, 300_000] as const;

export type LabDelayMs = (typeof LAB_DELAY_PRESETS_MS)[number];

/** Domyślne 300000 ms (5 minut) — dotychczasowe zachowanie CLEAN/SUCCESS. */
export const DEFAULT_LAB_DELAY_MS: LabDelayMs = 300_000;

export function isLabDelayMs(value: number): value is LabDelayMs {
  return (LAB_DELAY_PRESETS_MS as readonly number[]).includes(value);
}

export function assertLabDelayMs(value: number): LabDelayMs {
  if (!isLabDelayMs(value)) {
    throw new Error(
      `Nieprawidłowy czas generowania wyników: "${value}". Dozwolone wartości (ms): ${LAB_DELAY_PRESETS_MS.join(", ")}.`
    );
  }
  return value;
}

/**
 * Wartość startowa (bootstrap) `labDelayMs`, użyta TYLKO przy tworzeniu
 * wiersza konfiguracji po raz pierwszy — dokładnie ten sam wzorzec co
 * `resolveLabSimulatorScenario` dla `LAB_SIMULATOR_SCENARIO`
 * (`lab-simulator-scenario.ts`). W odróżnieniu od `assertLabDelayMs`
 * (walidacja presetów dla zapisu z panelu `/admin`) ta funkcja NIE ogranicza
 * wartości do presetów: `LAB_SIMULATOR_DELAY_MS` pozostaje furtką testową
 * (np. przyspieszenie testów e2e), a nie kolejnym publicznym ustawieniem.
 */
export function resolveLabDelayMsBootstrap(
  rawValue: string | undefined = process.env.LAB_SIMULATOR_DELAY_MS
): number {
  const configured = Number(rawValue);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_LAB_DELAY_MS;
}

/**
 * Sanity check użyty przez `WorkshopConfigService.setConfig` — luźniejszy niż
 * `assertLabDelayMs`. „Tylko presety" jest wymogiem panelu `/admin`
 * (egzekwowanym przez `AdminConfigUpdateDto` z `@IsIn(LAB_DELAY_PRESETS_MS)`),
 * a nie samego serwisu: serwis musi też przyjąć wartość odziedziczoną z
 * bootstrapu `LAB_SIMULATOR_DELAY_MS` (furtka testowa, może nie być presetem)
 * przy odczycie-i-zapisie tego samego stanu (np. zmiana samego scenariusza).
 */
export function assertFiniteNonNegativeLabDelayMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Nieprawidłowy czas generowania wyników: "${value}".`);
  }
  return value;
}
