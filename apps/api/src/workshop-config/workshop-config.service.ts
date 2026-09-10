import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  DEFAULT_LAB_SIMULATOR_SCENARIO,
  resolveLabSimulatorScenario,
  type LabSimulatorScenario
} from "../lab-simulator/lab-simulator-scenario";
import {
  assertControlledBug,
  DEFAULT_CONTROLLED_BUG,
  type ControlledBug
} from "./controlled-bug";
import {
  assertFiniteNonNegativeLabDelayMs,
  DEFAULT_LAB_DELAY_MS,
  resolveLabDelayMsBootstrap
} from "./lab-delay";

const CONFIG_ROW_ID = "singleton";

export interface WorkshopConfigState {
  labScenario: LabSimulatorScenario;
  controlledBug: ControlledBug;
  /**
   * Czas generowania wyników (ms). Wartość zapisana przez panel `/admin`
   * (`setConfig`) jest zawsze jednym z presetów `LAB_DELAY_PRESETS_MS`, ale
   * odczyt dopuszcza `number` — wartość startowa (bootstrap) może pochodzić z
   * `LAB_SIMULATOR_DELAY_MS` (furtka testowa), tak jak `labScenario` z
   * `LAB_SIMULATOR_SCENARIO`.
   */
  labDelayMs: number;
  updatedAt: Date;
}

export interface WorkshopConfigInput {
  labScenario: LabSimulatorScenario;
  controlledBug: ControlledBug;
  /**
   * "Tylko presety" jest wymogiem panelu `/admin`, egzekwowanym przez
   * `AdminConfigUpdateDto` (`@IsIn(LAB_DELAY_PRESETS_MS)`) — ten serwis robi
   * tylko luźny sanity check (`assertFiniteNonNegativeLabDelayMs`), żeby móc
   * też przyjąć wartość odziedziczoną z bootstrapu `LAB_SIMULATOR_DELAY_MS`
   * (furtka testowa), gdy wywołujący zmienia tylko scenariusz/defekt.
   */
  labDelayMs: number;
}

/**
 * Jedyne źródło prawdy o bieżącej, globalnej konfiguracji warsztatu:
 * aktywny scenariusz symulatora laboratorium i aktywny kontrolowany błąd.
 *
 * Konfiguracja jest trwała (jeden wiersz w tabeli `workshop_config`) i
 * CELOWO nie jest cache'owana w pamięci procesu: `npm run workshop:reset`
 * (`prisma/workshop-reset.ts`) i panel `/admin` mogą modyfikować ten wiersz z
 * osobnego procesu Node niż już uruchomione API (patrz
 * `resetWorkshopWorkspaces` w `common/prisma/reset-workshop.ts`). Cache w
 * instancji serwisu zostawiałby wtedy działający proces API z nieaktualną
 * konfiguracją mimo poprawnego resetu w bazie. Odczyt jednego wiersza przy
 * każdym użyciu jest tanią ceną za to, że globalny reset (CLI albo `/admin`)
 * zawsze faktycznie obowiązuje w już uruchomionym API — bez restartu procesu.
 *
 * `LAB_SIMULATOR_SCENARIO` pozostaje wyłącznie jako wartość startowa
 * (bootstrap) użyta TYLKO przy tworzeniu wiersza konfiguracji po raz
 * pierwszy (np. na świeżo zmigrowanej bazie) — nie jest już odczytywana przy
 * każdym wysłaniu zlecenia.
 */
@Injectable()
export class WorkshopConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<WorkshopConfigState> {
    const row = await this.ensureRow();
    return this.toState(row);
  }

  /**
   * Scenariusz symulatora laboratorium dla NOWEJ wysyłki zlecenia.
   *
   * Wywołujący musi przekazać ten wynik jawnie do zadania ponowienia w
   * momencie jego utworzenia (tak jak dotychczas) — automatyczne ponowienie
   * NIE wywołuje tej metody ponownie przy wykonaniu, tylko używa scenariusza
   * zapisanego w zadaniu. Dzięki temu zmiana konfiguracji z panelu `/admin`
   * nigdy nie zmienia scenariusza już zaplanowanego ponowienia.
   */
  async getLabScenario(): Promise<LabSimulatorScenario> {
    const config = await this.getConfig();
    return resolveLabSimulatorScenario(config.labScenario);
  }

  async getControlledBug(): Promise<ControlledBug> {
    const config = await this.getConfig();
    return config.controlledBug;
  }

  /**
   * Czas generowania wyników (ms) dla NOWEJ wysyłki zlecenia.
   *
   * Tak jak `getLabScenario`, wywołujący musi przekazać ten wynik jawnie do
   * zadania ponowienia w momencie jego utworzenia — automatyczne ponowienie
   * używa delay zapisanego w zadaniu, więc zmiana `labDelayMs` z `/admin` nie
   * przesuwa już zaplanowanego `lab_job.executeAt` ani `estimatedCompletionAt`.
   */
  async getLabDelayMs(): Promise<number> {
    const config = await this.getConfig();
    return config.labDelayMs;
  }

  async setConfig(input: WorkshopConfigInput): Promise<WorkshopConfigState> {
    const labScenario = resolveLabSimulatorScenario(input.labScenario);
    const controlledBug = assertControlledBug(input.controlledBug);
    const labDelayMs = assertFiniteNonNegativeLabDelayMs(input.labDelayMs);

    const row = await this.prisma.workshopConfig.upsert({
      where: { id: CONFIG_ROW_ID },
      create: { id: CONFIG_ROW_ID, labScenario, controlledBug, labDelayMs },
      update: { labScenario, controlledBug, labDelayMs }
    });

    return this.toState(row);
  }

  /**
   * Przywraca konfigurację do stanu domyślnego: `SUCCESS` + `CLEAN` + `300000`.
   *
   * Używa dosłownie `DEFAULT_LAB_SIMULATOR_SCENARIO` (`SUCCESS`), NIE
   * `resolveLabSimulatorScenario()` bez argumentu — ta funkcja czyta
   * `LAB_SIMULATOR_SCENARIO` ze środowiska jako fallback, więc wywołanie jej
   * tutaj mogłoby przywrócić inny scenariusz niż `SUCCESS`, gdy ta zmienna
   * jest ustawiona. Reset musi być deterministyczny niezależnie od env.
   */
  async resetToDefaults(): Promise<WorkshopConfigState> {
    return this.setConfig({
      labScenario: DEFAULT_LAB_SIMULATOR_SCENARIO,
      controlledBug: DEFAULT_CONTROLLED_BUG,
      labDelayMs: DEFAULT_LAB_DELAY_MS
    });
  }

  private async ensureRow() {
    const existing = await this.prisma.workshopConfig.findUnique({
      where: { id: CONFIG_ROW_ID }
    });
    if (existing) {
      return existing;
    }

    // Wiersz jeszcze nie istnieje (świeżo zmigrowana baza) — jedyny moment,
    // w którym `LAB_SIMULATOR_SCENARIO` i `LAB_SIMULATOR_DELAY_MS` są
    // odczytywane jako wartości startowe. `upsert` samo w sobie NIE jest
    // atomowe względem dwóch równoległych pierwszych odczytów (dwa procesy
    // mogą jednocześnie przejść przez `findUnique` powyżej i oba trafić w
    // `create`) — MySQL zgłasza wtedy naruszenie unikalności klucza
    // głównego (P2002) dla przegranego wyścigu. Zamiast propagować ten błąd
    // jako 500, przegrany po prostu odczytuje wiersz zapisany przez
    // zwycięzcę: efekt końcowy jest identyczny (jeden, wspólny wiersz
    // konfiguracji), więc wywołujący nigdy nie widzi tego wyścigu.
    const bootstrapScenario = resolveLabSimulatorScenario();
    const bootstrapLabDelayMs = resolveLabDelayMsBootstrap();
    try {
      return await this.prisma.workshopConfig.upsert({
        where: { id: CONFIG_ROW_ID },
        create: {
          id: CONFIG_ROW_ID,
          labScenario: bootstrapScenario,
          controlledBug: DEFAULT_CONTROLLED_BUG,
          labDelayMs: bootstrapLabDelayMs
        },
        update: {}
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      return this.prisma.workshopConfig.findUniqueOrThrow({
        where: { id: CONFIG_ROW_ID }
      });
    }
  }

  private isUniqueConstraintError(
    error: unknown
  ): error is { code?: string; errno?: number } {
    return (
      typeof error === "object" &&
      error !== null &&
      (("code" in error && error.code === "P2002") ||
        ("errno" in error && error.errno === 1062))
    );
  }

  private toState(row: {
    labScenario: string;
    controlledBug: string;
    labDelayMs: number;
    updatedAt: Date;
  }): WorkshopConfigState {
    return {
      labScenario: resolveLabSimulatorScenario(row.labScenario),
      controlledBug: assertControlledBug(row.controlledBug),
      labDelayMs: row.labDelayMs,
      updatedAt: row.updatedAt
    };
  }
}
