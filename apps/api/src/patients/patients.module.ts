import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkshopConfigModule } from "../workshop-config/workshop-config.module";
import { PatientsController } from "./patients.controller";
import { PatientsService } from "./patients.service";

@Module({
  imports: [AuthModule, WorkshopConfigModule],
  controllers: [PatientsController],
  providers: [PatientsService]
})
export class PatientsModule {}
