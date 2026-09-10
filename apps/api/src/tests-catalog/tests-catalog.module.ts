import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkshopConfigModule } from "../workshop-config/workshop-config.module";
import { TestsCatalogController } from "./tests-catalog.controller";
import { TestsCatalogService } from "./tests-catalog.service";

@Module({
  imports: [AuthModule, WorkshopConfigModule],
  controllers: [TestsCatalogController],
  providers: [TestsCatalogService]
})
export class TestsCatalogModule {}
