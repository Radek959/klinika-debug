import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { CorrelationIdMiddleware } from "./common/correlation/correlation-id.middleware";
import { PrismaModule } from "./common/prisma/prisma.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { getEnvFilePaths } from "./config/repo-paths";
import { validateEnvironment } from "./config/env.validation";
import { HealthModule } from "./health/health.module";
import { LabCallbacksModule } from "./lab-callbacks/lab-callbacks.module";
import { LabJobsModule } from "./lab-jobs/lab-jobs.module";
import { LabSendRetryModule } from "./lab-send-retry/lab-send-retry.module";
import { OrdersModule } from "./orders/orders.module";
import { PatientsModule } from "./patients/patients.module";
import { TestsCatalogModule } from "./tests-catalog/tests-catalog.module";
import { WorkshopConfigModule } from "./workshop-config/workshop-config.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvFilePaths(),
      validate: validateEnvironment
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    DashboardModule,
    PatientsModule,
    OrdersModule,
    TestsCatalogModule,
    LabCallbacksModule,
    LabJobsModule,
    LabSendRetryModule,
    WorkshopConfigModule,
    AdminModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
