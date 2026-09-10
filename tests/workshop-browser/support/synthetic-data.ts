/**
 * Generator syntetycznych, ale strukturalnie poprawnych numerów PESEL
 * (poprawna suma kontrolna) — port `generateSyntheticAdultPesel` z
 * `scripts/workshop-smoke/lib.cjs`, żeby kolejne uruchomienia suite'u mogły
 * tworzyć unikalnych pacjentów bez kolizji z danymi workspace'u
 * uczestnika (`tester01`) w wielokrotnie uruchamianym, wdrożonym środowisku.
 * Nigdy nie reprezentuje prawdziwej osoby.
 */

const PESEL_WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

/** Rocznik 1990, `serial` 0-999 dobrany tak, by numery kolejnych uruchomień się nie powtarzały. */
export function generateSyntheticAdultPesel(serial: number): string {
  if (!Number.isInteger(serial) || serial < 0 || serial > 999) {
    throw new Error("serial musi być liczbą całkowitą z zakresu 0-999.");
  }

  const yearPart = pad(90, 2); // 1990 - 1900
  const month = pad(1, 2);
  const day = "15";
  const genderDigit = "5"; // nieparzysta -> mężczyzna, wystarczające dla tego suite'u
  const serialDigits = pad(serial, 3);
  const base = `${yearPart}${month}${day}${serialDigits}${genderDigit}`;

  const sum = PESEL_WEIGHTS.reduce(
    (total, weight, index) => total + Number(base[index]) * weight,
    0
  );
  const checksum = (10 - (sum % 10)) % 10;
  return `${base}${checksum}`;
}

/** Serial 0-999 wyprowadzony z bieżącego czasu — unikalny w praktyce między uruchomieniami. */
export function nextPeselSerial(): number {
  return Date.now() % 1000;
}

/**
 * Rocznik 2018 (niepełnoletni pacjent, z dużym marginesem, przez wiele lat
 * warsztatu), `serial` 0-999 dobrany tak, by numery kolejnych uruchomień się
 * nie powtarzały. Używany przez browser regression PATIENT_GUARDIAN.
 */
export function generateSyntheticMinorPesel(serial: number): string {
  if (!Number.isInteger(serial) || serial < 0 || serial > 999) {
    throw new Error("serial musi być liczbą całkowitą z zakresu 0-999.");
  }

  const yearPart = pad(18, 2); // 2018 - 2000
  const encodedMonth = pad(21, 2); // styczeń, offset +20 dla roczników 2000-2099
  const day = "15";
  const genderDigit = "4"; // parzysta -> kobieta
  const serialDigits = pad(serial, 3);
  const base = `${yearPart}${encodedMonth}${day}${serialDigits}${genderDigit}`;

  const sum = PESEL_WEIGHTS.reduce(
    (total, weight, index) => total + Number(base[index]) * weight,
    0
  );
  const checksum = (10 - (sum % 10)) % 10;
  return `${base}${checksum}`;
}
