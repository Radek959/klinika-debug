import { Equals } from "class-validator";

/**
 * `confirm` musi być dosłownie `true`. To dodatkowy, jawny bezpiecznik na
 * poziomie kontraktu API — ten sam wzorzec co `ResetWorkshopOptions.confirm`
 * w `resetWorkshopWorkspaces`, którego panel `/admin` używa bez żadnej
 * własnej, równoległej logiki resetu.
 */
export class AdminResetDto {
  @Equals(true)
  confirm!: boolean;
}
