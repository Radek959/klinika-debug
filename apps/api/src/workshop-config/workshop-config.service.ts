import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import {
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
 * podręcznie cache'owana w pamięci procesu — aplikacja działa jako pojedynczy
 * proces Node, więc prosty cache w instancji serwisu jest wystarczający i nie
 * wymaga żadnej dodatkowej warstwy (Redis, pub/sub itp.).
 *
 * Nowa instancja serwisu (np. po restarcie procesu) zawsze odczytuje bieżący
 * stan z bazy przy pierwszym użyciu — konfiguracja nigdy nie wraca cicho do
 * wartości domyślnych tylko dlatego, że proces się zrestartował.
 *
 * `LAB_SIMULATOR_SCENARIO` pozostaje wyłącznie jako wartość startowa
 * (bootstrap) użyta TYLKO przy tworzeniu wiersza konfiguracji po raz
 * pierwszy (np. na świeżo zmigrowanej bazie) — nie jest już odczytywana przy
 * każdym wysłaniu zlecenia.
 */
@Injectable()
export class WorkshopConfigService {
  private cached: WorkshopConfigState | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<WorkshopConfigState> {
    if (this.cached) {
      return this.cached;
    }

    const row = await this.ensureRow();
    this.cached = this.toState(row);
    return this.cached;
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

    this.cached = this.toState(row);
    return this.cached;
  }

  /** Przywraca konfigurację do stanu domyślnego: `SUCCESS` + `CLEAN` + `300000`. */
  async resetToDefaults(): Promise<WorkshopConfigState> {
    return this.setConfig({
      labScenario: resolveLabSimulatorScenario(undefined),
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
    // odczytywane jako wartości startowe. Upsert chroni przed wyścigiem dwóch
    // równoległych pierwszych odczytów tuż po starcie procesu.
    const bootstrapScenario = resolveLabSimulatorScenario();
    const bootstrapLabDelayMs = resolveLabDelayMsBootstrap();
    return this.prisma.workshopConfig.upsert({
      where: { id: CONFIG_ROW_ID },
      create: {
        id: CONFIG_ROW_ID,
        labScenario: bootstrapScenario,
        controlledBug: DEFAULT_CONTROLLED_BUG,
        labDelayMs: bootstrapLabDelayMs
      },
      update: {}
    });
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
