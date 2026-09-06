import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LabSimulatorModule } from "../lab-simulator/lab-simulator.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [AuthModule, LabSimulatorModule],
  controllers: [OrdersController],
  providers: [OrdersService]
})
export class OrdersModule {}
