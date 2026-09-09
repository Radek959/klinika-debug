import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { seedDatabase } from "../src/common/prisma/seed-database";
import { closeTestApp, createTestApp } from "./test-app";
import { configureTestEnvironment, resetTestDatabase, setWorkshopConfig } from "./database";

describe("orders send api", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    configureTestEnvironment();
    process.env.SEED_STAFF_PASSWORD = "SeedTestowe123!";
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it("odrzuca brak tokenu", async () => {
    const { patientId, tests } = await setupDefaultOrderData();
    const token = (await login()).token;
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const response = await sendOrder("", order.id, { skipAuthHeader: true });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("zwraca 404 dla nieistniejącego zlecenia", async () => {
    const { token } = await login();
    const response = await sendOrder(token, "nonexistent-order-id");

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error.code).toBe("ORDER_NOT_FOUND");
  });

  it("zwraca 404 dla zlecenia z innego workspace'u", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const otherWorkspaceUser = await prisma.user.create({
      data: {
        workspaceId: (
          await prisma.workspace.create({
            data: { slug: "obca-klinika-send", name: "Obca Klinika Send" }
          })
        ).id,
        login: "staff.obcy.send",
        displayName: "Personel Obcej Kliniki",
        role: "STAFF",
        passwordHash: await hashPassword("HasloTestowe123!")
      }
    });
    const otherLoginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: otherWorkspaceUser.login, password: "HasloTestowe123!" }
    });
    const otherToken = JSON.parse(otherLoginResponse.body).token as string;

    const response = await sendOrder(otherToken, order.id);

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error.code).toBe("ORDER_NOT_FOUND");
  });

  it("odrzuca wysyłkę zlecenia bez zarejestrowanych próbek", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const response = await sendOrder(token, order.id);

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe("ORDER_SEND_ERROR");
    expect(body.error.fieldErrors).toContainEqual(
      expect.objectContaining({ field: "status", code: "ORDER_NOT_SENDABLE" })
    );
  });

  it("odrzuca wysyłkę dla nieaktywnego pacjenta", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-SEND-0001",
      collectedAt: nowIso()
    });
    await prisma.patient.update({ where: { id: patientId }, data: { active: false } });

    const response = await sendOrder(token, order.id);

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.fieldErrors).toContainEqual(
      expect.objectContaining({ field: "patientId", code: "PATIENT_INACTIVE" })
    );
  });

  it("wysyła zlecenie SAMPLE_COLLECTED i ustawia SENT_TO_LAB", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-SEND-0002",
      collectedAt: nowIso()
    });

    const correlationId = "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7";
    const response = await sendOrder(token, order.id, { correlationId });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("SENT_TO_LAB");
    expect(body.externalOrderId).toEqual(expect.stringMatching(/^EXT-/));
    expect(body.correlationId).toBe(correlationId);
    expect(body.sentAt).not.toBeNull();
    expect(body.estimatedCompletionAt).not.toBeNull();
    expect(response.headers["x-correlation-id"]).toBe(correlationId);

    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(persisted.status).toBe("SENT_TO_LAB");
    expect(persisted.externalOrderId).not.toBeNull();

    const keys = await prisma.idempotencyKey.count({ where: { orderId: order.id } });
    expect(keys).toBe(1);
    const idempotencyRecord = await prisma.idempotencyKey.findFirstOrThrow({
      where: { orderId: order.id }
    });
    expect(idempotencyRecord.responseStatus).toBe(200);
  });

  it("jest idempotentne przy ponownym żądaniu z tymi samymi danymi", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-SEND-0003",
      collectedAt: nowIso()
    });

    const first = await sendOrder(token, order.id);
    expect(first.statusCode).toBe(200);
    const firstBody = JSON.parse(first.body);

    const second = await sendOrder(token, order.id);
    expect(second.statusCode).toBe(200);
    const secondBody = JSON.parse(second.body);

    expect(secondBody.externalOrderId).toBe(firstBody.externalOrderId);
    expect(secondBody.status).toBe("SENT_TO_LAB");

    const keys = await prisma.idempotencyKey.count({ where: { orderId: order.id } });
    expect(keys).toBe(1);
  });

  it("odrzuca konflikt klucza idempotencji z inną sumą żądania", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-SEND-0004",
      collectedAt: nowIso()
    });

    const first = await sendOrder(token, order.id);
    expect(first.statusCode).toBe(200);

    await prisma.idempotencyKey.updateMany({
      where: { orderId: order.id },
      data: { requestHash: "manipulated-hash" }
    });

    const second = await sendOrder(token, order.id);

    expect(second.statusCode).toBe(409);
    expect(JSON.parse(second.body).error.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
  });

  it("respektuje labDelayMs skonfigurowany w /admin: estimatedCompletionAt i lab_job.executeAt ≈ now + labDelayMs", async () => {
    await setWorkshopConfig(app, { labScenario: "SUCCESS", labDelayMs: 5000 });

    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-SEND-DELAY-0001",
      collectedAt: nowIso()
    });

    const beforeSend = Date.now();
    const response = await sendOrder(token, order.id);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    const expectedAt = beforeSend + 5000;
    const toleranceMs = 2000;

    const estimatedCompletionAt = new Date(body.estimatedCompletionAt).getTime();
    expect(Math.abs(estimatedCompletionAt - expectedAt)).toBeLessThan(toleranceMs);

    const job = await prisma.labJob.findFirstOrThrow({ where: { orderId: order.id } });
    expect(Math.abs(job.executeAt.getTime() - expectedAt)).toBeLessThan(toleranceMs);
  });

  it("publikuje endpoint wysyłki w OpenAPI", async () => {
    const response = await app.inject({ method: "GET", url: "/api/docs-json" });
    expect(response.statusCode).toBe(200);
    const document = JSON.parse(response.body);
    const path = document.paths["/api/v1/orders/{orderId}/send"];
    expect(path).toBeDefined();
    expect(path.post).toBeDefined();
    expect(path.post.responses).toHaveProperty("200");
    expect(path.post.responses).toHaveProperty("401");
    expect(path.post.responses).toHaveProperty("404");
    expect(path.post.responses).toHaveProperty("409");
    expect(path.post.responses).toHaveProperty("422");
  });

  async function login() {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "staff.demo", password: "SeedTestowe123!" }
    });
    expect(loginResponse.statusCode).toBe(200);
    return { token: JSON.parse(loginResponse.body).token as string };
  }

  function nowIso() {
    return new Date().toISOString();
  }

  async function hashPassword(password: string) {
    const argon2 = await import("argon2");
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async function setupDefaultOrderData() {
    const { token } = await login();
    const user = await prisma.user.findUniqueOrThrow({
      where: { login: "staff.demo" }
    });
    const patient = await prisma.patient.findFirstOrThrow({
      where: { workspaceId: user.workspaceId, active: true }
    });
    const catalog = await prisma.medicalTest.findMany({
      orderBy: { code: "asc" }
    });
    const tests = Object.fromEntries(catalog.map((test) => [test.code, test]));

    return {
      token,
      workspaceId: user.workspaceId,
      patientId: patient.id,
      tests: tests as Record<string, { id: string }>
    };
  }

  async function createOrderAndParse(token: string, payload: Record<string, unknown>) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: { authorization: `Bearer ${token}` },
      payload
    });
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.body);
  }

  async function registerSample(
    token: string,
    orderId: string,
    payload: Record<string, unknown>
  ) {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/orders/${orderId}/samples`,
      headers: { authorization: `Bearer ${token}` },
      payload
    });
    expect(response.statusCode).toBe(200);
    return JSON.parse(response.body);
  }

  async function sendOrder(
    token: string,
    orderId: string,
    options: { skipAuthHeader?: boolean; correlationId?: string } = {}
  ) {
    const headers: Record<string, string> = {};
    if (!options.skipAuthHeader) {
      headers.authorization = `Bearer ${token}`;
    }
    if (options.correlationId) {
      headers["x-correlation-id"] = options.correlationId;
    }

    return app.inject({
      method: "POST",
      url: `/api/v1/orders/${orderId}/send`,
      headers
    });
  }
});
