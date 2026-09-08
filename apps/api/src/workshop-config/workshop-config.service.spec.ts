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
  updatedAt: Date;
}

function createPrismaStub() {
  let row: WorkshopConfigRow | null = null;
  let upsertCalls = 0;

  const prisma = {
    workshopConfig: {
      findUnique: jest.fn(async () => row),
      upsert: jest.fn(
        async (args: {
          where: { id: string };
          create: WorkshopConfigRow;
          update: Partial<WorkshopConfigRow>;
        }) => {
          upsertCalls += 1;
          if (!row) {
            row = { ...args.create, updatedAt: new Date() };
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

  it("bootstrapuje domyślną konfigurację SUCCESS + CLEAN na pustej bazie", async () => {
    delete process.env.LAB_SIMULATOR_SCENARIO;
    const { prisma } = createPrismaStub();
    const service = new WorkshopConfigService(prisma);

    const config = await service.getConfig();

    expect(config.labScenario).toBe("SUCCESS");
    expect(config.controlledBug).toBe("CLEAN");
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
      controlledBug: "CLEAN"
    });

    expect(updated.labScenario).toBe("PARTIAL_SUCCESS");
    expect(await service.getLabScenario()).toBe("PARTIAL_SUCCESS");
  });

  it("konfiguracja przeżywa ponowną instancję serwisu (symulacja restartu procesu)", async () => {
    const { prisma } = createPrismaStub();
    const first = new WorkshopConfigService(prisma);
    await first.setConfig({ labScenario: "RATE_LIMIT", controlledBug: "CLEAN" });

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
        controlledBug: "CLEAN"
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
        controlledBug: "NOT_A_BUG"
      })
    ).rejects.toThrow(/Nieprawidłowy kontrolowany błąd/);
  });

  it("resetToDefaults przywraca SUCCESS + CLEAN niezależnie od bieżącej konfiguracji", async () => {
    const { prisma } = createPrismaStub();
    const service = new WorkshopConfigService(prisma);
    await service.setConfig({ labScenario: "TIMEOUT", controlledBug: "CLEAN" });

    const reset = await service.resetToDefaults();

    expect(reset.labScenario).toBe("SUCCESS");
    expect(reset.controlledBug).toBe("CLEAN");
  });

  it("dwa równoległe pierwsze odczyty nie tworzą dwóch różnych bootstrapów", async () => {
    const { prisma, getUpsertCalls } = createPrismaStub();
    const service = new WorkshopConfigService(prisma);

    const [first, second] = await Promise.all([service.getConfig(), service.getConfig()]);

    expect(first).toEqual(second);
    expect(getUpsertCalls()).toBeGreaterThan(0);
  });
});
