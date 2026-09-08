import { IsIn } from "class-validator";
import { LAB_SIMULATOR_SCENARIOS } from "../../lab-simulator/lab-simulator-scenario";
import { CONTROLLED_BUGS } from "../../workshop-config/controlled-bug";
import { LAB_DELAY_PRESETS_MS } from "../../workshop-config/lab-delay";

export class AdminConfigUpdateDto {
  @IsIn(LAB_SIMULATOR_SCENARIOS)
  labScenario!: string;

  // Dozwolone wartości (i tylko one) pochodzą z jednego miejsca:
  // ../../workshop-config/controlled-bug.ts. Aktywny może być co najwyżej
  // jeden defekt naraz.
  @IsIn(CONTROLLED_BUGS)
  controlledBug!: string;

  // Wyłącznie presety z ../../workshop-config/lab-delay.ts — panel nie
  // pozwala wpisać dowolnej (arbitrary) wartości.
  @IsIn(LAB_DELAY_PRESETS_MS)
  labDelayMs!: number;
}
