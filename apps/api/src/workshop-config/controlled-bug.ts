/**
 * Kontrolowane defekty warsztatowe wybierane globalnie z panelu `/admin`.
 *
 * `CLEAN` oznacza zawsze poprawne, zgodne z dokumentacją produktową
 * zachowanie aplikacji. Ten plik jest jedynym miejscem, w którym trzeba
 * dopisać nowy defekt (`workshop-controlled-bugs`, PR #2) — sam panel
 * `/admin` i warstwa konfiguracji odczytują dozwolone wartości stąd, a nie z
 * osobnej, zduplikowanej listy.
 *
 * W tym PR-ze (`workshop-trainer-controls`) jedyną dozwoloną wartością jest
 * `CLEAN`: panel przygotowuje pole wyboru na przyszłe defekty, ale nie
 * pozwala aktywować niczego, co jeszcze nie istnieje.
 */
export const CONTROLLED_BUGS = ["CLEAN"] as const;

export type ControlledBug = (typeof CONTROLLED_BUGS)[number];

export const DEFAULT_CONTROLLED_BUG: ControlledBug = "CLEAN";

export function isControlledBug(value: string): value is ControlledBug {
  return (CONTROLLED_BUGS as readonly string[]).includes(value);
}

export function assertControlledBug(value: string): ControlledBug {
  if (!isControlledBug(value)) {
    throw new Error(
      `Nieprawidłowy kontrolowany błąd: "${value}". Dozwolone wartości: ${CONTROLLED_BUGS.join(", ")}.`
    );
  }
  return value;
}
