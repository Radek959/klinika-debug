import { Module } from "@nestjs/common";
import { OrderHistoryService } from "./order-history.service";

@Module({
  providers: [OrderHistoryService],
  exports: [OrderHistoryService]
})
export class OrderHistoryModule {}
