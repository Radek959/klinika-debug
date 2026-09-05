import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { calculateSessionExpiry } from "@klinika/domain";
import { PrismaService } from "../src/common/prisma/prisma.service";
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
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
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

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "staff.a", password }
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.token).toEqual(expect.any(String));
    expect(body.user.workspace.name).toBe("Klinika A");

    const session = await prisma.userSession.findFirstOrThrow();
    expect(session.tokenHash).not.toBe(body.token);
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

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "staff.a", password }
    });
    expect(loginResponse.statusCode).toBe(200);
    const loginBody = JSON.parse(loginResponse.body);

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

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${loginBody.token}` }
    });
    expect(meResponse.statusCode).toBe(200);
    const meBody = JSON.parse(meResponse.body);
    expect(meBody.user.login).toBe("staff.a");
    expect(meBody.user.workspace.slug).toBe("klinika-a");

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

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        "x-correlation-id": "a3a90c31-a45b-4e36-8f42-17f33196693c"
      },
      payload: { login: "staff.a", password: "bledne" }
    });
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(401);
    expect(response.headers["x-correlation-id"]).toBe(
      "a3a90c31-a45b-4e36-8f42-17f33196693c"
    );
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
    expect(body.error.correlationId).toBe(
      "a3a90c31-a45b-4e36-8f42-17f33196693c"
    );
  });

  it("unieważnia sesję przy wylogowaniu", async () => {
    const password = "HasloTestowe123!";
    await createStaffUser(prisma, {
      workspaceSlug: "klinika-a",
      workspaceName: "Klinika A",
      login: "staff.a",
      password
    });
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "staff.a", password }
    });
    expect(loginResponse.statusCode).toBe(200);
    const loginBody = JSON.parse(loginResponse.body);

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { authorization: `Bearer ${loginBody.token}` }
    });
    expect(logoutResponse.statusCode).toBe(204);

    const session = await prisma.userSession.findFirstOrThrow();
    expect(session.revokedAt).toBeInstanceOf(Date);
  });
});
