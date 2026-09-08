import { WorkshopConfigService } from "./workshop-config.service";
import type { PrismaService } from "../common/prisma/prisma.service";

/**
 * Testy na atrapie Prismy trzymającej jeden wiersz `workshop_config` w
 * pamięci — sprawdzamy tu logikę bootstrapu, cache'u w procesie i walidacji,
 * bez realnej bazy danych (pełny przepływ z bazą pokrywa test migracji i
 * testy e2e panelu `/admin`).
 */
interface WorkshopConfigRow {
  id: string;
  labScenario: string;
  controlledBug: string;
  labDelayMs: number;
  updatedAt: Date;
}

// Prisma w prawdziwej bazie ma DEFAULT 300000 na kolumnie labDelayMs
// (migracja `20260908130000_workshop_lab_delay`) — atrapa odtwarza to samo
// zachowanie, żeby bootstrap bez jawnego labDelayMs (tak jak w
// `ensureWorkshopConfigExists`) zachowywał się identycznie jak na realnej bazie.
const DB_DEFAULT_LAB_DELAY_MS = 300000;

function createPrismaStub() {
  let row: WorkshopConfigRow | null = null;
  let upsertCalls = 0;

  const prisma = {
    workshopConfig: {
      findUnique: jest.fn(async () => row),
      upsert: jest.fn(
        async (args: {
          where: { id: string };
          create: Partial<WorkshopConfigRow> & Pick<WorkshopConfigRow, "id" | "labScenario" | "controlledBug">;
          update: Partial<WorkshopConfigRow>;
        }) => {
          upsertCalls += 1;
          if (!row) {
            row = {
              labDelayMs: DB_DEFAULT_LAB_DELAY_MS,
              ...args.create,
              updatedAt: new Date()
            };
          } else if (Object.keys(args.update).length > 0) {
            row = { ...row, ...args.update, updatedAt: new Date() };
          }
          return row;
        }
      )
    }
  } as unknown as PrismaService;

  return {
    prisma,
    getUpsertCalls: () => upsertCalls,
    getRow: () => row
  };
}

describe("WorkshopConfigService", () => {
  const originalScenario = process.env.LAB_SIMULATOR_SCENARIO;

  afterEach(() => {
    if (originalScenario === undefined) {
      delete process.env.LAB_SIMULATOR_SCENARIO;
    } else {
      process.env.LAB_SIMULATOR_SCENARIO = originalScenario;
    }
  });

  it("bootstrapuje domyślną konfigurację SUCCESS + CLEAN + 300000 ms na pustej bazie", async () => {
    delete process.env.LAB_SIMULATOR_SCENARIO;
    const { prisma } = createPrismaStub();
    const service = new WorkshopConfigService(prisma);

    const config = await service.getConfig();

    expect(config.labScenario).toBe("SUCCESS");
    expect(config.controlledBug).toBe("CLEAN");
    expect(config.labDelayMs).toBe(300000);
    expect(await service.getLabDelayMs()).toBe(300000);
  });

  it("używa LAB_SIMULATOR_SCENARIO jako wartości startowej TYLKO przy pierwszym bootstrapie", async () => {
    process.env.LAB_SIMULATOR_SCENARIO = "SERVER_ERROR";
    const { prisma } = createPrismaStub();
    const service = new WorkshopConfigService(prisma);

    const config = await service.getConfig();

    expect(config.labScenario).toBe("SERVER_ERROR");
  });

  it("odczyt i zapis konfiguracji: setConfig zmienia bieżący stan", async () => {
    const { prisma } = createPrismaStub();
    const service = new WorkshopConfigService(prisma);
    await service.getConfig();

    const updated = await service.setConfig({
      labScenario: "PARTIAL_SUCCESS",
      controlledBug: "CLEAN",
      labDelayMs: 15000
    });

    expect(updated.labScenario).toBe("PARTIAL_SUCCESS");
    expect(await service.getLabScenario()).toBe("PARTIAL_SUCCESS");
    expect(updated.labDelayMs).toBe(15000);
    expect(await service.getLabDelayMs()).toBe(15000);
  });

  it("konfiguracja przeżywa ponowną instancję serwisu (symulacja restartu procesu)", async () => {
    const { prisma } = createPrismaStub();
    const first = new WorkshopConfigService(prisma);
    await first.setConfig({ labScenario: "RATE_LIMIT", controlledBug: "CLEAN", labDelayMs: 300000 });

    // Nowa instancja serwisu = nowy, pusty cache w procesie. Musi odczytać
    // bieżący stan z (atrapy) bazy, a nie cicho wrócić do domyślnych wartości.
    const second = new WorkshopConfigService(prisma);
    const config = await second.getConfig();

    expect(config.labScenario).toBe("RATE_LIMIT");
  });

  it("odrzuca nieprawidłowy scenariusz laboratorium przy zapisie", async () => {
    const { prisma } = createPrismaStub();
    const service = new WorkshopConfigService(prisma);

    await expect(
      service.setConfig({
        // @ts-expect-error - celowo nieprawidłowa wartość na potrzeby testu
        labScenario: "NOT_A_SCENARIO",
        controlledBug: "CLEAN",
        labDelayMs: 300000
      })
    ).rejects.toThrow(/LAB_SIMULATOR_SCENARIO|NOT_A_SCENARIO/);
  });

  it("odrzuca nieprawidłowy kontrolowany błąd przy zapisie", async () => {
    const { prisma } = createPrismaStub();
    const service = new WorkshopConfigService(prisma);

    await expect(
      service.setConfig({
        labScenario: "SUCCESS",
        // @ts-expect-error - celowo nieprawidłowa wartość na potrzeby testu
        controlledBug: "NOT_A_BUG",
        labDelayMs: 300000
      })
    ).rejects.toThrow(/Nieprawidłowy kontrolowany błąd/);
  });

  it.each([5000, 15000, 30000, 60000, 300000])(
    "akceptuje preset labDelayMs = %i ms",
    async (preset) => {
      const { prisma } = createPrismaStub();
      const service = new WorkshopConfigService(prisma);

      const updated = await service.setConfig({
        labScenario: "SUCCESS",
        controlledBug: "CLEAN",
        labDelayMs: preset as 5000 | 15000 | 30000 | 60000 | 300000
      });

      expect(updated.labDelayMs).toBe(preset);
    }
  );

  it("odrzuca dowolną (arbitrary) wartość labDelayMs spoza presetów", async () => {
    const { prisma } = createPrismaStub();
    const service = new WorkshopConfigService(prisma);

    await expect(
      service.setConfig({
        labScenario: "SUCCESS",
        controlledBug: "CLEAN",
        // @ts-expect-error - celowo nieprawidłowa wartość na potrzeby testu
        labDelayMs: 12345
      })
    ).rejects.toThrow(/Nieprawidłowy czas generowania wyników/);
  });

  it("resetToDefaults przywraca SUCCESS + CLEAN + 300000 ms niezależnie od bieżącej konfiguracji", async () => {
    const { prisma } = createPrismaStub();
    const service = new WorkshopConfigService(prisma);
    await service.setConfig({ labScenario: "TIMEOUT", controlledBug: "CLEAN", labDelayMs: 5000 });

    const reset = await service.resetToDefaults();

    expect(reset.labScenario).toBe("SUCCESS");
    expect(reset.controlledBug).toBe("CLEAN");
    expect(reset.labDelayMs).toBe(300000);
  });

  it("dwa równoległe pierwsze odczyty nie tworzą dwóch różnych bootstrapów", async () => {
    const { prisma, getUpsertCalls } = createPrismaStub();
    const service = new WorkshopConfigService(prisma);

    const [first, second] = await Promise.all([service.getConfig(), service.getConfig()]);

    expect(first).toEqual(second);
    expect(getUpsertCalls()).toBeGreaterThan(0);
  });
});
