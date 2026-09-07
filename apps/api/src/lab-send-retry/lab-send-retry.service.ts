import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { OrdersService } from "../orders/orders.service";

/**
 * Maksymalna liczba zadań ponowienia przetwarzanych w jednym przebiegu.
 * Ogranicza wpływ pojedynczego ticku na bazę przy większej liczbie zaległości.
 */
const MAX_JOBS_PER_TICK = 5;

/**
 * Po tym czasie zadanie zablokowane w `PROCESSING` jest uznawane za osierocone
 * (proces padł w trakcie wykonania) i wraca do `PENDING`.
 */
const STALE_LOCK_TIMEOUT_MS = 60_000;

/**
 * Przetwarzanie trwałej kolejki automatycznych ponowień WYSYŁKI zlecenia.
 *
 * Poprawność nie opiera się na `setTimeout` ani na żadnym stanie w pamięci
 * procesu: terminy są zapisane w kolumnie `executeAt`, a przejęcie zadania jest
 * atomowe, więc kolejka przeżywa restart, redeploy i wiele równoległych
 * instancji schedulera.
 *
 * Serwis jest celowo oddzielony od pętli czasowej (`LabSendRetryScheduler`),
 * dzięki czemu testy wywołują `processDueJobs` jawnie, zamiast czekać realnych
 * 15 sekund.
 */
@Injectable()
export class LabSendRetryService {
  private readonly logger = new Logger(LabSendRetryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService
  ) {}

  /**
   * Wykonuje wszystkie wymagalne zadania ponowienia.
   *
   * Pobierane są wyłącznie zadania z `executeAt <= now` — zadanie zaplanowane
   * w przyszłości nie zostanie wykonane wcześniej.
   */
  async processDueJobs(now: Date = new Date()): Promise<number> {
    await this.releaseStaleLocks(now);

    const dueJobs = await this.prisma.labSendRetryJob.findMany({
      where: {
        status: "PENDING",
        executeAt: { lte: now }
      },
      select: { id: true },
      take: MAX_JOBS_PER_TICK,
      orderBy: { executeAt: "asc" }
    });

    let processed = 0;
    for (const job of dueJobs) {
      if (await this.processJob(job.id, now)) {
        processed += 1;
      }
    }
    return processed;
  }

  /**
   * Przejmuje i wykonuje pojedyncze zadanie.
   *
   * Przejęcie jest atomowe: warunkowy `updateMany` po statusie `PENDING` może
   * się powieść tylko w jednym procesie, więc to samo zadanie nie zostanie
   * wykonane równolegle dwa razy. Warunek `executeAt <= now` jest powtórzony
   * w klauzuli przejęcia — to celowe wzmocnienie wobec schedulera `lab_jobs`:
   * zadanie przełożone na przyszłość między odczytem a przejęciem nie może
   * zostać wykonane przedwcześnie.
   *
   * Zwraca `true`, jeżeli to wywołanie faktycznie przejęło zadanie.
   */
  async processJob(jobId: string, now: Date = new Date()): Promise<boolean> {
    const claimed = await this.prisma.labSendRetryJob.updateMany({
      where: { id: jobId, status: "PENDING", executeAt: { lte: now } },
      data: {
        status: "PROCESSING",
        lockedAt: new Date(),
        attempts: { increment: 1 }
      }
    });

    if (claimed.count === 0) {
      // Zadanie przejęte przez inny proces albo jeszcze niewymagalne.
      return false;
    }

    try {
      await this.orders.executeSendRetry(jobId);
    } catch (error) {
      await this.markJobFailed(jobId, error);
    }

    return true;
  }

  /**
   * Zwalnia zadanie po nieudanym wykonaniu.
   *
   * Zadanie wraca do `PENDING` z zachowanym terminem, więc kolejny przebieg
   * spróbuje ponownie. Zapisujemy wyłącznie krótki komunikat błędu — bez stack
   * trace'a i bez danych pacjenta.
   */
  private async markJobFailed(jobId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Nie udało się ponowić wysyłki zlecenia (zadanie ${jobId}).`, message);

    await this.prisma.labSendRetryJob.updateMany({
      where: { id: jobId, status: "PROCESSING" },
      data: {
        status: "PENDING",
        lockedAt: null,
        lastError: message.slice(0, 180)
      }
    });
  }

  private async releaseStaleLocks(now: Date): Promise<void> {
    await this.prisma.labSendRetryJob.updateMany({
      where: {
        status: "PROCESSING",
        lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_TIMEOUT_MS) }
      },
      data: { status: "PENDING", lockedAt: null }
    });
  }
}
