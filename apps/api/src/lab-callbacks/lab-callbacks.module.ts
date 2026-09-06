import { Module } from "@nestjs/common";
import { LabCallbacksController } from "./lab-callbacks.controller";
import { LabCallbacksService } from "./lab-callbacks.service";

@Module({
  controllers: [LabCallbacksController],
  providers: [LabCallbacksService],
  exports: [LabCallbacksService]
})
export class LabCallbacksModule {}
