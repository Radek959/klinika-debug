import request from "supertest";
import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { calculateSessionExpiry } from "@klinika/domain";
import { closeTestApp, createTestApp } from "./test-app";
import {
  configureTestEnvironment,
  createStaffUser,
  resetTestDatabase
} from "./database";

describe("auth api", () => {
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

  it("loguje konto STAFF i zapisuje wyłącznie hash tokenu sesji", async () => {
    const password = "HasloTestowe123!";
    await createStaffUser(prisma, {
      workspaceSlug: "klinika-a",
      workspaceName: "Klinika A",
      login: "staff.a",
      password
    });

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ login: "staff.a", password })
      .expect(200);

    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user.workspace.name).toBe("Klinika A");

    const session = await prisma.userSession.findFirstOrThrow();
    expect(session.tokenHash).not.toBe(response.body.token);
    expect(session.lastActivityAt).toBeInstanceOf(Date);
    expect(session.expiresAt).toBeInstanceOf(Date);
    expect(session.revokedAt).toBeNull();
  });

  it("zwraca bieżącego użytkownika i odświeża aktywność sesji", async () => {
    const password = "HasloTestowe123!";
    await createStaffUser(prisma, {
      workspaceSlug: "klinika-a",
      workspaceName: "Klinika A",
      login: "staff.a",
      password
    });

    const loginResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ login: "staff.a", password })
      .expect(200);

    const session = await prisma.userSession.findFirstOrThrow();
    const now = Date.now();
    const oldActivity = new Date(now - 10 * 60 * 1000);
    await prisma.userSession.update({
      where: { id: session.id },
      data: {
        lastActivityAt: oldActivity,
        expiresAt: calculateSessionExpiry(oldActivity)
      }
    });

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${loginResponse.body.token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.user.login).toBe("staff.a");
        expect(body.user.workspace.slug).toBe("klinika-a");
      });

    const updatedSession = await prisma.userSession.findUniqueOrThrow({
      where: { id: session.id }
    });
    expect(updatedSession.lastActivityAt.getTime()).toBeGreaterThan(
      oldActivity.getTime()
    );
    expect(updatedSession.expiresAt.getTime()).toBeGreaterThan(
      calculateSessionExpiry(oldActivity).getTime()
    );
  });

  it("odrzuca błędne logowanie z correlationId", async () => {
    await createStaffUser(prisma, {
      workspaceSlug: "klinika-a",
      workspaceName: "Klinika A",
      login: "staff.a",
      password: "HasloTestowe123!"
    });

    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("X-Correlation-ID", "a3a90c31-a45b-4e36-8f42-17f33196693c")
      .send({ login: "staff.a", password: "bledne" })
      .expect(401)
      .expect("X-Correlation-ID", "a3a90c31-a45b-4e36-8f42-17f33196693c")
      .expect(({ body }) => {
        expect(body.error.code).toBe("INVALID_CREDENTIALS");
        expect(body.error.correlationId).toBe(
          "a3a90c31-a45b-4e36-8f42-17f33196693c"
        );
      });
  });

  it("unieważnia sesję przy wylogowaniu", async () => {
    const password = "HasloTestowe123!";
    await createStaffUser(prisma, {
      workspaceSlug: "klinika-a",
      workspaceName: "Klinika A",
      login: "staff.a",
      password
    });
    const loginResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ login: "staff.a", password })
      .expect(200);

    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${loginResponse.body.token}`)
      .expect(204);

    const session = await prisma.userSession.findFirstOrThrow();
    expect(session.revokedAt).toBeInstanceOf(Date);
  });
});
