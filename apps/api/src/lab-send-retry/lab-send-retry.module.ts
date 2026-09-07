import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module";
import { LabSendRetryScheduler } from "./lab-send-retry.scheduler";
import { LabSendRetryService } from "./lab-send-retry.service";

/**
 * Kolejka i scheduler automatycznych ponowień wysyłki zlecenia.
 *
 * Moduł zależy od `OrdersModule` (wykonanie ponowienia jest operacją domenową
 * zlecenia), a nie odwrotnie — dzięki temu nie powstaje zależność cykliczna:
 * `OrdersService` tylko planuje zadania, a nie zna schedulera.
 */
@Module({
  imports: [OrdersModule],
  providers: [LabSendRetryService, LabSendRetryScheduler],
  exports: [LabSendRetryService]
})
export class LabSendRetryModule {}
