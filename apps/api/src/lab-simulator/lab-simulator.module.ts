import { Module } from "@nestjs/common";
import { LabSimulatorService } from "./lab-simulator.service";

@Module({
  providers: [LabSimulatorService],
  exports: [LabSimulatorService]
})
export class LabSimulatorModule {}
