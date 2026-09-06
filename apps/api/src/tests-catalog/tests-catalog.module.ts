import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TestsCatalogController } from "./tests-catalog.controller";
import { TestsCatalogService } from "./tests-catalog.service";

@Module({
  imports: [AuthModule],
  controllers: [TestsCatalogController],
  providers: [TestsCatalogService]
})
export class TestsCatalogModule {}
