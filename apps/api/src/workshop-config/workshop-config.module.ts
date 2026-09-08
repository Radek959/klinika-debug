import { Module } from "@nestjs/common";
import { WorkshopConfigService } from "./workshop-config.service";

@Module({
  providers: [WorkshopConfigService],
  exports: [WorkshopConfigService]
})
export class WorkshopConfigModule {}
