import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { closeTestApp, createTestApp } from "./test-app";
import { configureTestEnvironment, resetTestDatabase } from "./database";

describe("health and docs", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    configureTestEnvironment();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it("udostępnia /health/live poza prefiksem /api/v1", async () => {
    const liveResponse = await app.inject({
      method: "GET",
      url: "/health/live"
    });
    expect(liveResponse.statusCode).toBe(200);
    expect(JSON.parse(liveResponse.body).status).toBe("ok");

    const prefixedResponse = await app.inject({
      method: "GET",
      url: "/api/v1/health/live"
    });
    expect(prefixedResponse.statusCode).toBe(404);
  });

  it("udostępnia /health/ready poza prefiksem /api/v1", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health/ready"
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).database).toBe("ok");
  });

  it("wykonuje zapytanie do MySQL przez adapter Prisma", async () => {
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toEqual(
      expect.any(Array)
    );
  });

  it("udostępnia OpenAPI pod /api/docs poza prefiksem /api/v1", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/docs"
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Klinika Debug API");
  });

  it("zwraca kontrolowany polski błąd dla nieznanego endpointu", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/nie-ma-takiej-sciezki"
    });
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(404);
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
    expect(body.error.message).toBe("Nie znaleziono zasobu.");
    expect(body.error.message).not.toContain("Cannot GET");
  });
});
