import { PrismaClient } from "@prisma/client";
import { DEFAULT_CONTROLLED_BUG } from "../../workshop-config/controlled-bug";
import { resolveLabSimulatorScenario } from "../../lab-simulator/lab-simulator-scenario";

const CONFIG_ROW_ID = "singleton";

/**
 * Gwarantuje istnienie wiersza `workshop_config`, nie zmieniając go, jeśli
 * już istnieje. Używane przez `workshop:prepare`, żeby przygotowanie
 * środowiska nigdy nie zostawiało panelu `/admin` bez konfiguracji, ale też
 * nigdy nie nadpisywało aktywnego scenariusza/kontrolowanego błędu
 * ustawionego wcześniej przez prowadzącego.
 */
export async function ensureWorkshopConfigExists(client: PrismaClient): Promise<void> {
  await client.workshopConfig.upsert({
    where: { id: CONFIG_ROW_ID },
    create: {
      id: CONFIG_ROW_ID,
      labScenario: resolveLabSimulatorScenario(),
      controlledBug: DEFAULT_CONTROLLED_BUG
    },
    update: {}
  });
}
