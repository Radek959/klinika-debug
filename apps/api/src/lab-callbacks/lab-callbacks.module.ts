import { Module } from "@nestjs/common";
import { OrderHistoryModule } from "../order-history/order-history.module";
import { LabCallbacksController } from "./lab-callbacks.controller";
import { LabCallbacksService } from "./lab-callbacks.service";

@Module({
  imports: [OrderHistoryModule],
  controllers: [LabCallbacksController],
  providers: [LabCallbacksService],
  exports: [LabCallbacksService]
})
export class LabCallbacksModule {}
