import { Module } from "@nestjs/common";
import { TestsCatalogController } from "./tests-catalog.controller";
import { TestsCatalogService } from "./tests-catalog.service";

@Module({
  controllers: [TestsCatalogController],
  providers: [TestsCatalogService]
})
export class TestsCatalogModule {}
