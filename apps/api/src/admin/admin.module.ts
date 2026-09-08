import { Module } from "@nestjs/common";
import { PasswordService } from "../auth/password.service";
import { WorkshopConfigModule } from "../workshop-config/workshop-config.module";
import { AdminAuthGuard } from "./admin-auth.guard";
import { AdminController } from "./admin.controller";
import { AdminSessionService } from "./admin-session.service";
import { AdminViewController } from "./admin-view.controller";

@Module({
  imports: [WorkshopConfigModule],
  controllers: [AdminController, AdminViewController],
  providers: [AdminSessionService, AdminAuthGuard, PasswordService]
})
export class AdminModule {}
