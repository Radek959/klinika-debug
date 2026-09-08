import { IsIn } from "class-validator";
import { LAB_SIMULATOR_SCENARIOS } from "../../lab-simulator/lab-simulator-scenario";
import { CONTROLLED_BUGS } from "../../workshop-config/controlled-bug";

export class AdminConfigUpdateDto {
  @IsIn(LAB_SIMULATOR_SCENARIOS)
  labScenario!: string;

  // Dozwolone wartości (i tylko one) pochodzą z jednego miejsca:
  // ../../workshop-config/controlled-bug.ts. Aktywny może być co najwyżej
  // jeden defekt naraz.
  @IsIn(CONTROLLED_BUGS)
  controlledBug!: string;
}
