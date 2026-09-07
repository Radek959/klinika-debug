import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { LabSendRetryService } from "./lab-send-retry.service";

const DEFAULT_POLL_INTERVAL_MS = 2000;

/**
 * Pętla czasowa uruchamiająca przetwarzanie kolejki ponowień wysyłki.
 *
 * Sama pętla jest wyłącznie wyzwalaczem — cała poprawność (wymagalność zadania,
 * atomowe przejęcie, brak duplikatów) jest po stronie bazy i
 * `LabSendRetryService`. Dzięki temu proces uruchomiony na Hostingerze razem
 * z API działa tak samo jak wiele równoległych instancji.
 */
@Injectable()
export class LabSendRetryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LabSendRetryScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly labSendRetry: LabSendRetryService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.labSendRetry.processDueJobs().catch((error) => {
        this.logger.error(
          "Błąd przetwarzania kolejki ponowień wysyłki zlecenia",
          error instanceof Error ? (error.stack ?? error.message) : String(error)
        );
      });
    }, this.getPollIntervalMs());
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private getPollIntervalMs(): number {
    const configured = Number(process.env.LAB_SCHEDULER_POLL_INTERVAL_MS);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_POLL_INTERVAL_MS;
  }
}
