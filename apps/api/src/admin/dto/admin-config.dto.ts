import { IsIn } from "class-validator";
import { LAB_SIMULATOR_SCENARIOS } from "../../lab-simulator/lab-simulator-scenario";
import { CONTROLLED_BUGS } from "../../workshop-config/controlled-bug";

export class AdminConfigUpdateDto {
  @IsIn(LAB_SIMULATOR_SCENARIOS)
  labScenario!: string;

  // W tym PR-ze `CONTROLLED_BUGS` zawiera wyłącznie "CLEAN": panel nie
  // pozwala aktywować żadnego defektu, który jeszcze nie istnieje. Kolejne
  // wartości dopisze PR workshop-controlled-bugs w jednym miejscu:
  // ../../workshop-config/controlled-bug.ts.
  @IsIn(CONTROLLED_BUGS)
  controlledBug!: string;
}
