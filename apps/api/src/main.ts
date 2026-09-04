import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication
} from "@nestjs/platform-fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";

const RESERVED_SPA_PREFIXES = ["/api", "/api/docs", "/health", "/internal"];
type StaticReply = { sendFile: (fileName: string) => unknown };
type CorrelatedRequest = { correlationId?: string };

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false })
  );

  configureApp(app);

  await registerFrontend(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
}

async function registerFrontend(app: NestFastifyApplication) {
  const webDist = process.env.WEB_DIST_DIR ?? resolve(process.cwd(), "apps/web/dist");
  const indexFile = join(webDist, "index.html");

  if (!existsSync(indexFile)) {
    return;
  }

  const fastify = app.getHttpAdapter().getInstance();
  await (fastify.register as any)(fastifyStatic, {
    root: webDist,
    prefix: "/"
  });

  fastify.setNotFoundHandler((request, reply) => {
    const url = request.url;
    const acceptsHtml = request.headers.accept?.includes("text/html") ?? false;
    const isReservedPath = RESERVED_SPA_PREFIXES.some(
      (prefix) => url === prefix || url.startsWith(`${prefix}/`)
    );

    if (request.method === "GET" && acceptsHtml && !isReservedPath) {
      return (reply as unknown as StaticReply).sendFile("index.html");
    }

    return reply.status(404).send({
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: "Nie znaleziono zasobu.",
        correlationId:
          (request as unknown as CorrelatedRequest).correlationId ?? randomUUID()
      }
    });
  });
}

void bootstrap();
