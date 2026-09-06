import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { seedDatabase } from "../src/common/prisma/seed-database";
import { closeTestApp, createTestApp } from "./test-app";
import {
  configureTestEnvironment,
  createStaffUser,
  resetTestDatabase
} from "./database";

describe("orders samples api", () => {
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
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const response = await registerSample(
      "",
      order.id,
      { materialType: "SERUM", barcode: "SMP-0001", collectedAt: nowIso() },
      { skipAuthHeader: true }
    );

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejestruje jedyną wymaganą próbkę i ustawia SAMPLE_COLLECTED", async () => {
    const { token, userId, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    expect(order.samples).toHaveLength(1);
    expect(order.samples[0].materialType).toBe("SERUM");

    const collectedAt = nowIso();
    const response = await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-SERUM-0001",
      collectedAt
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("SAMPLE_COLLECTED");
    expect(body.samples).toEqual([
      expect.objectContaining({
        materialType: "SERUM",
        status: "COLLECTED",
        barcode: "SMP-SERUM-0001",
        collectedAt,
        collectedByUserId: userId
      })
    ]);

    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(persisted.status).toBe("SAMPLE_COLLECTED");
  });

  it("ustawia SAMPLE_COLLECTION_IN_PROGRESS po pierwszej z dwóch wymaganych próbek", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
    });
    expect(order.samples.map((sample: { materialType: string }) => sample.materialType).sort()).toEqual(
      ["EDTA_BLOOD", "SERUM"]
    );

    const firstResponse = await registerSample(token, order.id, {
      materialType: "EDTA_BLOOD",
      barcode: "SMP-EDTA-0001",
      collectedAt: nowIso()
    });
    expect(firstResponse.statusCode).toBe(200);
    expect(JSON.parse(firstResponse.body).status).toBe(
      "SAMPLE_COLLECTION_IN_PROGRESS"
    );

    const secondResponse = await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-SERUM-0002",
      collectedAt: nowIso()
    });
    expect(secondResponse.statusCode).toBe(200);
    expect(JSON.parse(secondResponse.body).status).toBe("SAMPLE_COLLECTED");
  });

  it("zwraca 404 dla nieistniejącego zlecenia", async () => {
    const { token } = await setupDefaultOrderData();

    const response = await registerSample(token, "nonexistent-order-id", {
      materialType: "SERUM",
      barcode: "SMP-0001",
      collectedAt: nowIso()
    });

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

    const otherLogin = "staff.obcy";
    await createStaffUser(prisma, {
      workspaceSlug: "obca-klinika",
      workspaceName: "Obca Klinika",
      login: otherLogin,
      password: "HasloTestowe123!"
    });
    const otherLoginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: otherLogin, password: "HasloTestowe123!" }
    });
    const otherToken = JSON.parse(otherLoginResponse.body).token as string;

    const response = await registerSample(otherToken, order.id, {
      materialType: "SERUM",
      barcode: "SMP-0001",
      collectedAt: nowIso()
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error.code).toBe("ORDER_NOT_FOUND");
  });

  it("odrzuca rodzaj materiału niewymagany w zleceniu", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const response = await registerSample(token, order.id, {
      materialType: "URINE",
      barcode: "SMP-0001",
      collectedAt: nowIso()
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe("SAMPLE_REGISTRATION_ERROR");
    expect(body.error.fieldErrors).toContainEqual(
      expect.objectContaining({ field: "materialType", code: "MATERIAL_TYPE_NOT_REQUIRED" })
    );
  });

  it("odrzuca powtórną rejestrację tej samej próbki", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const first = await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-SERUM-1000",
      collectedAt: nowIso()
    });
    expect(first.statusCode).toBe(200);

    const second = await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-SERUM-1001",
      collectedAt: nowIso()
    });

    expect(second.statusCode).toBe(422);
    const body = JSON.parse(second.body);
    expect(body.error.fieldErrors).toContainEqual(
      expect.objectContaining({ field: "materialType", code: "SAMPLE_ALREADY_COLLECTED" })
    );
    expect(body.error.fieldErrors).toContainEqual(
      expect.objectContaining({ field: "status", code: "ORDER_NOT_EDITABLE" })
    );
  });

  it("odrzuca zduplikowany kod kreskowy w obrębie workspace'u", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const firstOrder = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    const secondOrder = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.TSH.id }]
    });

    const first = await registerSample(token, firstOrder.id, {
      materialType: "SERUM",
      barcode: "SMP-DUPLICATE",
      collectedAt: nowIso()
    });
    expect(first.statusCode).toBe(200);

    const second = await registerSample(token, secondOrder.id, {
      materialType: "SERUM",
      barcode: "SMP-DUPLICATE",
      collectedAt: nowIso()
    });

    expect(second.statusCode).toBe(422);
    expect(JSON.parse(second.body).error.fieldErrors).toContainEqual(
      expect.objectContaining({ field: "barcode", code: "DUPLICATE_BARCODE" })
    );
  });

  it("odrzuca datę pobrania w przyszłości", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const response = await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-0001",
      collectedAt: farFuture
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.fieldErrors).toContainEqual(
      expect.objectContaining({ field: "collectedAt", code: "COLLECTED_AT_IN_FUTURE" })
    );
  });

  it("odrzuca datę pobrania wcześniejszą niż utworzenie zlecenia", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { createdAt: new Date("2026-09-05T00:00:00.000Z") }
    });

    const response = await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-0001",
      collectedAt: "2020-01-01T00:00:00.000Z"
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.fieldErrors).toContainEqual(
      expect.objectContaining({ field: "collectedAt", code: "COLLECTED_AT_BEFORE_ORDER" })
    );
  });

  it("odrzuca niepoprawny rodzaj materiału", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const response = await registerSample(token, order.id, {
      materialType: "PLASMA",
      barcode: "SMP-0001",
      collectedAt: nowIso()
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.fieldErrors).toContainEqual(
      expect.objectContaining({ field: "materialType", code: "INVALID_MATERIAL_TYPE" })
    );
  });

  it("odrzuca pusty kod kreskowy", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const response = await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "",
      collectedAt: nowIso()
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.fieldErrors).toContainEqual(
      expect.objectContaining({ field: "barcode", code: "BARCODE_REQUIRED" })
    );
  });

  it("odrzuca niepoprawny format daty pobrania", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const response = await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-0001",
      collectedAt: "2026/09/04"
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.fieldErrors).toContainEqual(
      expect.objectContaining({ field: "collectedAt", code: "INVALID_DATE_FORMAT" })
    );
  });

  it("publikuje endpoint rejestracji próbki w OpenAPI", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/docs-json"
    });
    expect(response.statusCode).toBe(200);
    const document = JSON.parse(response.body);
    const path = document.paths["/api/v1/orders/{orderId}/samples"];
    expect(path).toBeDefined();
    expect(path.post).toBeDefined();
    expect(path.post.responses).toHaveProperty("200");
    expect(path.post.responses).toHaveProperty("400");
    expect(path.post.responses).toHaveProperty("401");
    expect(path.post.responses).toHaveProperty("404");
    expect(path.post.responses).toHaveProperty("422");
  });

  async function setupDefaultOrderData() {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "staff.demo", password: "SeedTestowe123!" }
    });
    expect(loginResponse.statusCode).toBe(200);

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
      token: JSON.parse(loginResponse.body).token as string,
      userId: user.id,
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
    payload: Record<string, unknown>,
    options: { skipAuthHeader?: boolean } = {}
  ) {
    return app.inject({
      method: "POST",
      url: `/api/v1/orders/${orderId}/samples`,
      headers: options.skipAuthHeader ? {} : { authorization: `Bearer ${token}` },
      payload
    });
  }

  function nowIso() {
    return new Date().toISOString();
  }
});
