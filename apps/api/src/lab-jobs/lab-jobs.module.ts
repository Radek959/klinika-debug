import { Module } from "@nestjs/common";
import { LabCallbacksModule } from "../lab-callbacks/lab-callbacks.module";
import { LabJobsScheduler } from "./lab-jobs.scheduler";

@Module({
  imports: [LabCallbacksModule],
  providers: [LabJobsScheduler]
})
export class LabJobsModule {}
