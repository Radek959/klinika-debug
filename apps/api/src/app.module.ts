import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { CorrelationIdMiddleware } from "./common/correlation/correlation-id.middleware";
import { PrismaModule } from "./common/prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { PatientsModule } from "./patients/patients.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"]
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    PatientsModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
