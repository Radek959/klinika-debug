import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  NestFastifyApplication
} from "@nestjs/platform-fastify";

export async function createTestApp(): Promise<NestFastifyApplication> {
  const [{ AppModule }, { configureApp }] = await Promise.all([
    import("../src/app.module"),
    import("../src/app.setup")
  ]);

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: false })
  );
  configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export async function closeTestApp(app: INestApplication | undefined) {
  if (app) {
    await app.close();
  }
}
