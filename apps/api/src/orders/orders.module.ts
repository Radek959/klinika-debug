import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LabSimulatorModule } from "../lab-simulator/lab-simulator.module";
import { OrderHistoryModule } from "../order-history/order-history.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { WorkshopConfigModule } from "../workshop-config/workshop-config.module";

@Module({
  imports: [AuthModule, LabSimulatorModule, OrderHistoryModule, WorkshopConfigModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService]
})
export class OrdersModule {}
