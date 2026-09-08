import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication
} from "@nestjs/platform-fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { logBootstrapError } from "./config/bootstrap-error";
import { getWebDistPath } from "./config/repo-paths";

const RESERVED_SPA_PREFIXES = ["/api", "/api/docs", "/health", "/internal", "/admin"];
type StaticReply = { sendFile: (fileName: string) => unknown };
type CorrelatedRequest = { correlationId?: string };

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false })
  );

  configureApp(app);

  await registerFrontend(app);

  const port = Number(process.env.PORT);
  await app.listen(port, "0.0.0.0");
}

async function registerFrontend(app: NestFastifyApplication) {
  const webDist = getWebDistPath();
  const indexFile = join(webDist, "index.html");

  if (!existsSync(indexFile)) {
    return;
  }

  const fastify = app.getHttpAdapter().getInstance();
  await (fastify.register as any)(fastifyStatic, {
    root: webDist,
    prefix: "/",
    wildcard: false
  });

  fastify.get("/*", (request, reply) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const acceptsHtml = request.headers.accept?.includes("text/html") ?? false;
    const isReservedPath = RESERVED_SPA_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
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

bootstrap().catch((error) => {
  logBootstrapError(error);
  process.exit(1);
});
