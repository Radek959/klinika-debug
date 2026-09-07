import { LabSendRetryService } from "./lab-send-retry.service";
import type { PrismaService } from "../common/prisma/prisma.service";
import type { OrdersService } from "../orders/orders.service";

/**
 * Testy schedulera ponowień wysyłki na atrapie Prismy.
 *
 * Sprawdzamy tu wyłącznie logikę pobierania i przejmowania zadań — pełny
 * przepływ z bazą pokrywają testy e2e. Poprawność nie może zależeć od
 * `setTimeout`, więc wszystkie przypadki wywołują `processDueJobs` jawnie
 * z kontrolowanym „teraz”.
 */
interface LabSendRetryJobRow {
  id: string;
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  executeAt: Date;
  lockedAt: Date | null;
  /** Numer próby wysyłki do laboratorium — techniczny błąd workera go NIE zmienia. */
  attemptNumber: number;
  /** Licznik technicznych uruchomień zadania przez scheduler. */
  attempts: number;
  lastError: string | null;
}

function createPrismaStub(rows: LabSendRetryJobRow[]) {
  const findManyCalls: unknown[] = [];

  const prisma = {
    labSendRetryJob: {
      findMany: jest.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
        findManyCalls.push(args.where);
        const where = args.where as {
          status?: string;
          executeAt?: { lte: Date };
        };
        return rows
          .filter((row) => row.status === where.status)
          .filter((row) =>
            where.executeAt ? row.executeAt.getTime() <= where.executeAt.lte.getTime() : true
          )
          .slice(0, args.take ?? rows.length)
          .map((row) => ({ id: row.id }));
      }),
      updateMany: jest.fn(
        async (args: {
          where: {
            id?: string;
            status?: string | { in?: string[] };
            executeAt?: { lte: Date };
            lockedAt?: { lt: Date };
          };
          data: Record<string, unknown>;
        }) => {
          const matching = rows.filter((row) => {
            if (args.where.id && row.id !== args.where.id) {
              return false;
            }
            if (typeof args.where.status === "string" && row.status !== args.where.status) {
              return false;
            }
            if (
              args.where.executeAt &&
              row.executeAt.getTime() > args.where.executeAt.lte.getTime()
            ) {
              return false;
            }
            if (
              args.where.lockedAt &&
              (row.lockedAt === null ||
                row.lockedAt.getTime() >= args.where.lockedAt.lt.getTime())
            ) {
              return false;
            }
            return true;
          });

          for (const row of matching) {
            if (typeof args.data.status === "string") {
              row.status = args.data.status as LabSendRetryJobRow["status"];
            }
            if (args.data.lockedAt === null) {
              row.lockedAt = null;
            } else if (args.data.lockedAt instanceof Date) {
              row.lockedAt = args.data.lockedAt;
            }
            if (typeof args.data.lastError === "string") {
              row.lastError = args.data.lastError;
            }
            if (args.data.executeAt instanceof Date) {
              row.executeAt = args.data.executeAt;
            }
            const increment = (args.data.attempts as { increment?: number } | undefined)
              ?.increment;
            if (typeof increment === "number") {
              row.attempts += increment;
            }
            const attemptNumberIncrement = (
              args.data.attemptNumber as { increment?: number } | undefined
            )?.increment;
            if (typeof attemptNumberIncrement === "number") {
              row.attemptNumber += attemptNumberIncrement;
            }
          }

          return { count: matching.length };
        }
      )
    }
  };

  return { prisma: prisma as unknown as PrismaService, findManyCalls, rows };
}

function createOrdersStub(behaviour: (jobId: string) => Promise<void> = async () => {}) {
  return {
    executeSendRetry: jest.fn(behaviour)
  } as unknown as OrdersService & { executeSendRetry: jest.Mock };
}

const NOW = new Date("2026-09-07T10:00:15.000Z");

function pendingJob(overrides: Partial<LabSendRetryJobRow> = {}): LabSendRetryJobRow {
  return {
    id: "job-1",
    status: "PENDING",
    executeAt: new Date("2026-09-07T10:00:15.000Z"),
    lockedAt: null,
    attemptNumber: 2,
    attempts: 0,
    lastError: null,
    ...overrides
  };
}

describe("LabSendRetryService", () => {
  it("wykonuje zadanie, którego termin już nadszedł", async () => {
    const { prisma, rows } = createPrismaStub([pendingJob()]);
    const orders = createOrdersStub();
    const service = new LabSendRetryService(prisma, orders);

    const processed = await service.processDueJobs(NOW);

    expect(processed).toBe(1);
    expect(orders.executeSendRetry).toHaveBeenCalledWith("job-1");
    expect(rows[0].status).toBe("PROCESSING");
    expect(rows[0].attempts).toBe(1);
  });

  it("pomija zadanie zaplanowane na przyszłość", async () => {
    const { prisma, rows } = createPrismaStub([
      pendingJob({ executeAt: new Date("2026-09-07T10:00:30.000Z") })
    ]);
    const orders = createOrdersStub();
    const service = new LabSendRetryService(prisma, orders);

    const processed = await service.processDueJobs(NOW);

    expect(processed).toBe(0);
    expect(orders.executeSendRetry).not.toHaveBeenCalled();
    expect(rows[0].status).toBe("PENDING");
  });

  it("pobiera wyłącznie zadania PENDING z terminem nie późniejszym niż teraz", async () => {
    const { prisma, findManyCalls } = createPrismaStub([pendingJob()]);
    const service = new LabSendRetryService(prisma, createOrdersStub());

    await service.processDueJobs(NOW);

    expect(findManyCalls).toContainEqual({
      status: "PENDING",
      executeAt: { lte: NOW }
    });
  });

  it("przejmuje zadanie atomowo — drugi proces nie wykona go po raz drugi", async () => {
    const { prisma, rows } = createPrismaStub([pendingJob()]);
    const orders = createOrdersStub();
    const service = new LabSendRetryService(prisma, orders);

    const first = await service.processJob("job-1", NOW);
    const second = await service.processJob("job-1", NOW);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(orders.executeSendRetry).toHaveBeenCalledTimes(1);
    expect(rows[0].attempts).toBe(1);
  });

  it("nie wykonuje równolegle tego samego zadania w dwóch przebiegach", async () => {
    const { prisma } = createPrismaStub([pendingJob()]);
    const orders = createOrdersStub();
    const service = new LabSendRetryService(prisma, orders);

    const results = await Promise.all([
      service.processJob("job-1", NOW),
      service.processJob("job-1", NOW),
      service.processJob("job-1", NOW)
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(orders.executeSendRetry).toHaveBeenCalledTimes(1);
  });

  it("nie wykonuje zadania, które nie jest jeszcze wymagalne, nawet przy jawnym wywołaniu", async () => {
    const { prisma } = createPrismaStub([
      pendingJob({ executeAt: new Date("2026-09-07T10:00:30.000Z") })
    ]);
    const orders = createOrdersStub();
    const service = new LabSendRetryService(prisma, orders);

    expect(await service.processJob("job-1", NOW)).toBe(false);
    expect(orders.executeSendRetry).not.toHaveBeenCalled();
  });

  describe("błąd wykonania zadania", () => {
    /**
     * Wyjątek celowo niosący treść, która NIE MOŻE trafić do danych aplikacji:
     * dane pacjenta, kod kreskowy i fragment zapytania SQL.
     */
    function failingOrdersStub() {
      const error = new Error(
        "SELECT * FROM patients WHERE pesel = '44051401458' — próbka SMP-0001"
      );
      error.stack = `${error.message}\n    at OrdersService.executeSendRetry (orders.service.ts:1200:11)`;
      return createOrdersStub(async () => {
        throw error;
      });
    }

    it("zwraca zadanie do PENDING zamiast pozostawiać je w PROCESSING", async () => {
      const { prisma, rows } = createPrismaStub([pendingJob()]);
      const service = new LabSendRetryService(prisma, failingOrdersStub());

      await service.processDueJobs(NOW);

      expect(rows[0].status).toBe("PENDING");
      expect(rows[0].lockedAt).toBeNull();
    });

    it("przesuwa executeAt w przyszłość, zamiast zostawiać termin z przeszłości", async () => {
      const { prisma, rows } = createPrismaStub([pendingJob()]);
      const service = new LabSendRetryService(prisma, failingOrdersStub());

      await service.processDueJobs(NOW);

      expect(rows[0].executeAt.getTime()).toBeGreaterThan(NOW.getTime());
      // Odsunięcie o co najmniej 15 sekund, czyli wielokrotność okresu ticku.
      expect(rows[0].executeAt.getTime() - NOW.getTime()).toBeGreaterThanOrEqual(15_000);
    });

    it("nie podejmuje zadania w tym samym ani w następnym ticku schedulera", async () => {
      const { prisma, rows } = createPrismaStub([pendingJob()]);
      const orders = failingOrdersStub();
      const service = new LabSendRetryService(prisma, orders);

      await service.processDueJobs(NOW);
      expect(orders.executeSendRetry).toHaveBeenCalledTimes(1);

      // Natychmiastowy kolejny przebieg oraz przebieg po typowym ticku (~2 s).
      expect(await service.processDueJobs(NOW)).toBe(0);
      expect(await service.processDueJobs(new Date(NOW.getTime() + 2_000))).toBe(0);
      expect(orders.executeSendRetry).toHaveBeenCalledTimes(1);
      expect(rows[0].attempts).toBe(1);
    });

    it("podejmuje zadanie dopiero po nadejściu nowego executeAt", async () => {
      const { prisma, rows } = createPrismaStub([pendingJob()]);
      const orders = failingOrdersStub();
      const service = new LabSendRetryService(prisma, orders);

      await service.processDueJobs(NOW);
      const newExecuteAt = rows[0].executeAt;

      expect(
        await service.processDueJobs(new Date(newExecuteAt.getTime() - 1))
      ).toBe(0);
      expect(await service.processDueJobs(newExecuteAt)).toBe(1);
      expect(orders.executeSendRetry).toHaveBeenCalledTimes(2);
    });

    it("nie zwiększa attemptNumber, ale liczy techniczne uruchomienia workera", async () => {
      const { prisma, rows } = createPrismaStub([pendingJob({ attemptNumber: 2 })]);
      const service = new LabSendRetryService(prisma, failingOrdersStub());

      await service.processDueJobs(NOW);

      // `attemptNumber` opisuje próbę komunikacji z laboratorium — techniczny
      // błąd workera jej nie zużywa.
      expect(rows[0].attemptNumber).toBe(2);
      expect(rows[0].attempts).toBe(1);
    });

    it("zapisuje wyłącznie stały komunikat techniczny, bez stack trace'a i danych wrażliwych", async () => {
      const { prisma, rows } = createPrismaStub([pendingJob()]);
      const service = new LabSendRetryService(prisma, failingOrdersStub());

      await service.processDueJobs(NOW);

      expect(rows[0].lastError).toBe("Techniczny błąd wykonania zadania ponowienia wysyłki.");
      expect(rows[0].lastError).not.toContain("44051401458");
      expect(rows[0].lastError).not.toContain("SMP-0001");
      expect(rows[0].lastError).not.toContain("SELECT");
      expect(rows[0].lastError).not.toContain("orders.service.ts");
      expect(rows[0].lastError).not.toContain("    at ");
    });
  });

  it("uwalnia osierocone blokady zadań zawieszonych w PROCESSING", async () => {
    const staleJob = pendingJob({
      status: "PROCESSING",
      lockedAt: new Date("2026-09-07T09:58:00.000Z")
    });
    const { prisma, rows } = createPrismaStub([staleJob]);
    const service = new LabSendRetryService(prisma, createOrdersStub());

    await service.processDueJobs(NOW);

    // Po zwolnieniu blokady zadanie zostaje przejęte i wykonane w tym samym przebiegu.
    expect(rows[0].status).toBe("PROCESSING");
    expect(rows[0].attempts).toBe(1);
  });

  it("nie rusza świeżo zablokowanego zadania innego procesu", async () => {
    const freshJob = pendingJob({
      status: "PROCESSING",
      lockedAt: new Date("2026-09-07T10:00:14.000Z")
    });
    const { prisma, rows } = createPrismaStub([freshJob]);
    const orders = createOrdersStub();
    const service = new LabSendRetryService(prisma, orders);

    await service.processDueJobs(NOW);

    expect(orders.executeSendRetry).not.toHaveBeenCalled();
    expect(rows[0].attempts).toBe(0);
  });
});
