import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LabSimulatorModule } from "../lab-simulator/lab-simulator.module";
import { OrderHistoryModule } from "../order-history/order-history.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [AuthModule, LabSimulatorModule, OrderHistoryModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService]
})
export class OrdersModule {}
