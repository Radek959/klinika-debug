import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { LabResultsWebhookRequest } from "@klinika/api-contracts";
import { PrismaService } from "../common/prisma/prisma.service";
import { LabCallbacksService } from "../lab-callbacks/lab-callbacks.service";

const DEFAULT_POLL_INTERVAL_MS = 2000;
const STALE_LOCK_TIMEOUT_MS = 60_000;
const MAX_JOBS_PER_TICK = 5;

@Injectable()
export class LabJobsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LabJobsScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly labCallbacks: LabCallbacksService
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.tick().catch((error) =>
        this.logger.error("Błąd przetwarzania kolejki lab_jobs", error)
      );
    }, this.getPollIntervalMs());
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async tick(): Promise<void> {
    await this.releaseStaleLocks();

    const dueJobs = await this.prisma.labJob.findMany({
      where: { status: "PENDING", executeAt: { lte: new Date() } },
      take: MAX_JOBS_PER_TICK,
      orderBy: { executeAt: "asc" }
    });

    for (const job of dueJobs) {
      await this.processJob(job.id);
    }
  }

  private async processJob(jobId: string): Promise<void> {
    const claimed = await this.prisma.labJob.updateMany({
      where: { id: jobId, status: "PENDING" },
      data: { status: "PROCESSING", lockedAt: new Date(), attempts: { increment: 1 } }
    });
    if (claimed.count === 0) {
      // Zadanie przejęte przez inny proces w tej samej chwili — bez efektu.
      return;
    }

    const job = await this.prisma.labJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return;
    }

    try {
      await this.labCallbacks.processResults(
        job.payload as unknown as LabResultsWebhookRequest
      );
      await this.prisma.labJob.update({ where: { id: jobId }, data: { status: "DONE" } });
    } catch (error) {
      await this.prisma.labJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          lastError: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  private async releaseStaleLocks(): Promise<void> {
    await this.prisma.labJob.updateMany({
      where: {
        status: "PROCESSING",
        lockedAt: { lt: new Date(Date.now() - STALE_LOCK_TIMEOUT_MS) }
      },
      data: { status: "PENDING", lockedAt: null }
    });
  }

  private getPollIntervalMs(): number {
    const configured = Number(process.env.LAB_SCHEDULER_POLL_INTERVAL_MS);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_POLL_INTERVAL_MS;
  }
}
