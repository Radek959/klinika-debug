import request from "supertest";
import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { closeTestApp, createTestApp } from "./test-app";
import { configureTestEnvironment, resetTestDatabase } from "./database";

describe("health and docs", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    configureTestEnvironment();
    prisma = new PrismaClient();
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp(app);
  });

  it("udostępnia /health/live poza prefiksem /api/v1", async () => {
    await request(app.getHttpServer())
      .get("/health/live")
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("ok");
      });

    await request(app.getHttpServer()).get("/api/v1/health/live").expect(404);
  });

  it("udostępnia /health/ready poza prefiksem /api/v1", async () => {
    await request(app.getHttpServer())
      .get("/health/ready")
      .expect(200)
      .expect(({ body }) => {
        expect(body.database).toBe("ok");
      });
  });

  it("udostępnia OpenAPI pod /api/docs poza prefiksem /api/v1", async () => {
    await request(app.getHttpServer())
      .get("/api/docs")
      .expect(200)
      .expect((response) => {
        expect(response.text).toContain("Klinika Debug API");
      });
  });

  it("zwraca kontrolowany polski błąd dla nieznanego endpointu", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/nie-ma-takiej-sciezki")
      .expect(404)
      .expect(({ body }) => {
        expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
        expect(body.error.message).toBe("Nie znaleziono zasobu.");
        expect(body.error.message).not.toContain("Cannot GET");
      });
  });
});
