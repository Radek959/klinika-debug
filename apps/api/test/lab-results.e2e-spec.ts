import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { seedDatabase } from "../src/common/prisma/seed-database";
import { closeTestApp, createTestApp } from "./test-app";
import { configureTestEnvironment, resetTestDatabase } from "./database";

describe("lab results webhook and scheduler", () => {
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

  it("odrzuca webhook bez poprawnego sekretu", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/lab/results",
      payload: {
        externalOrderId: "EXT-unknown",
        eventId: "evt-1",
        status: "COMPLETED",
        results: [],
        pendingMedicalTestIds: []
      }
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error.code).toBe("LAB_WEBHOOK_UNAUTHORIZED");
  });

  it("zwraca 404 dla nieznanego externalOrderId", async () => {
    const response = await webhook({
      externalOrderId: "EXT-nonexistent",
      eventId: "evt-2",
      status: "COMPLETED",
      results: [],
      pendingMedicalTestIds: []
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error.code).toBe("ORDER_NOT_FOUND");
  });

  it("przetwarza pełny wynik i ustawia COMPLETED", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-LAB-0001",
      collectedAt: nowIso()
    });
    const sendResponse = await sendOrder(token, order.id);
    expect(sendResponse.statusCode).toBe(200);
    const externalOrderId = JSON.parse(sendResponse.body).externalOrderId as string;

    const response = await webhook({
      externalOrderId,
      eventId: "evt-crp-complete",
      status: "COMPLETED",
      results: [
        {
          medicalTestId: tests.CRP.id,
          parameters: [{ code: "CRP", value: "3.10", unit: "mg/L", flag: "NORMAL" }]
        }
      ],
      pendingMedicalTestIds: []
    });

    expect(response.statusCode).toBe(204);

    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(persisted.status).toBe("COMPLETED");

    const sample = await prisma.sample.findFirstOrThrow({ where: { orderId: order.id } });
    expect(sample.status).toBe("ACCEPTED");

    const orderTest = await prisma.orderTest.findFirstOrThrow({ where: { orderId: order.id } });
    expect(orderTest.status).toBe("COMPLETED");

    const result = await prisma.result.findFirstOrThrow({ where: { orderId: order.id } });
    expect(result.value).toBe("3.10");
    expect(result.unit).toBe("mg/L");
    expect(result.flag).toBe("NORMAL");

    const detailsResponse = await app.inject({
      method: "GET",
      url: `/api/v1/orders/${order.id}`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(detailsResponse.statusCode).toBe(200);
    const details = JSON.parse(detailsResponse.body);
    expect(details.results).toEqual([
      {
        medicalTestId: tests.CRP.id,
        parameters: [
          expect.objectContaining({
            code: "CRP",
            value: "3.10",
            unit: "mg/L",
            flag: "NORMAL"
          })
        ]
      }
    ]);
  });

  it("ignoruje ponowne dostarczenie tego samego eventId", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-LAB-0002",
      collectedAt: nowIso()
    });
    const sendResponse = await sendOrder(token, order.id);
    const externalOrderId = JSON.parse(sendResponse.body).externalOrderId as string;

    const payload = {
      externalOrderId,
      eventId: "evt-crp-duplicate",
      status: "COMPLETED" as const,
      results: [
        {
          medicalTestId: tests.CRP.id,
          parameters: [{ code: "CRP", value: "5.00", unit: "mg/L", flag: "NORMAL" as const }]
        }
      ],
      pendingMedicalTestIds: []
    };

    const first = await webhook(payload);
    expect(first.statusCode).toBe(204);
    const second = await webhook(payload);
    expect(second.statusCode).toBe(204);

    const resultCount = await prisma.result.count({ where: { orderId: order.id } });
    expect(resultCount).toBe(1);
    const eventCount = await prisma.processedLabEvent.count({ where: { orderId: order.id } });
    expect(eventCount).toBe(1);
  });

  it("ustawia PARTIAL po częściowym wyniku i COMPLETED po uzupełnieniu", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
    });
    await registerSample(token, order.id, {
      materialType: "EDTA_BLOOD",
      barcode: "SMP-LAB-0003",
      collectedAt: nowIso()
    });
    await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-LAB-0004",
      collectedAt: nowIso()
    });
    const sendResponse = await sendOrder(token, order.id);
    const externalOrderId = JSON.parse(sendResponse.body).externalOrderId as string;

    const partial = await webhook({
      externalOrderId,
      eventId: "evt-partial",
      status: "PARTIAL",
      results: [
        {
          medicalTestId: tests.CRP.id,
          parameters: [{ code: "CRP", value: "2.50", unit: "mg/L", flag: "NORMAL" }]
        }
      ],
      pendingMedicalTestIds: [tests.MORF.id]
    });
    expect(partial.statusCode).toBe(204);

    const afterPartial = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(afterPartial.status).toBe("PARTIAL");

    const completion = await webhook({
      externalOrderId,
      eventId: "evt-completion",
      status: "COMPLETED",
      results: [
        {
          medicalTestId: tests.MORF.id,
          parameters: [
            { code: "WBC", value: "6.20", unit: "10^9/L", flag: "NORMAL" },
            { code: "RBC", value: "4.80", unit: "10^12/L", flag: "NORMAL" },
            { code: "HGB", value: "14.10", unit: "g/dL", flag: "NORMAL" },
            { code: "PLT", value: "250.00", unit: "10^9/L", flag: "NORMAL" }
          ]
        }
      ],
      pendingMedicalTestIds: []
    });
    expect(completion.statusCode).toBe(204);

    const afterCompletion = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(afterCompletion.status).toBe("COMPLETED");

    const resultCount = await prisma.result.count({ where: { orderId: order.id } });
    expect(resultCount).toBe(5);
  });

  it("przetwarza wynik automatycznie przez scheduler bez ręcznego webhooka", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-LAB-0005",
      collectedAt: nowIso()
    });
    const sendResponse = await sendOrder(token, order.id);
    expect(sendResponse.statusCode).toBe(200);

    const completedOrder = await waitForOrderStatus(order.id, "COMPLETED", 8000);
    expect(completedOrder.status).toBe("COMPLETED");
    expect(completedOrder.externalOrderId).not.toBeNull();

    const resultCount = await prisma.result.count({ where: { orderId: order.id } });
    expect(resultCount).toBe(1);

    const labJob = await prisma.labJob.findFirstOrThrow({ where: { orderId: order.id } });
    expect(labJob.status).toBe("DONE");
  });

  it("publikuje endpoint webhooka w OpenAPI", async () => {
    const response = await app.inject({ method: "GET", url: "/api/docs-json" });
    expect(response.statusCode).toBe(200);
    const document = JSON.parse(response.body);
    const path = document.paths["/api/v1/integrations/lab/results"];
    expect(path).toBeDefined();
    expect(path.post).toBeDefined();
    expect(path.post.responses).toHaveProperty("204");
    expect(path.post.responses).toHaveProperty("401");
    expect(path.post.responses).toHaveProperty("404");
  });

  async function waitForOrderStatus(orderId: string, status: string, timeoutMs: number) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      if (order.status === status) {
        return order;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Zlecenie nie osiągnęło statusu ${status} w ciągu ${timeoutMs}ms.`);
  }

  async function login() {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "staff.demo", password: "SeedTestowe123!" }
    });
    expect(loginResponse.statusCode).toBe(200);
    return { token: JSON.parse(loginResponse.body).token as string };
  }

  async function setupDefaultOrderData() {
    const { token } = await login();
    const user = await prisma.user.findUniqueOrThrow({
      where: { login: "staff.demo" }
    });
    const patient = await prisma.patient.findFirstOrThrow({
      where: { workspaceId: user.workspaceId, active: true }
    });
    const catalog = await prisma.medicalTest.findMany({ orderBy: { code: "asc" } });
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

  async function sendOrder(token: string, orderId: string) {
    return app.inject({
      method: "POST",
      url: `/api/v1/orders/${orderId}/send`,
      headers: { authorization: `Bearer ${token}` }
    });
  }

  async function webhook(payload: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: "/api/v1/integrations/lab/results",
      headers: { "x-lab-webhook-secret": process.env.LAB_WEBHOOK_SECRET ?? "" },
      payload
    });
  }

  function nowIso() {
    return new Date().toISOString();
  }
});
