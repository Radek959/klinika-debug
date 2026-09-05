import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PatientsController } from "./patients.controller";

@Module({
  imports: [AuthModule],
  controllers: [PatientsController]
})
export class PatientsModule {}
