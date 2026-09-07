import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { seedDatabase } from "../src/common/prisma/seed-database";
import { OrderHistoryService } from "../src/order-history/order-history.service";
import { closeTestApp, createTestApp } from "./test-app";
import {
  configureTestEnvironment,
  createStaffUser,
  resetTestDatabase
} from "./database";

describe("orders history api", () => {
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

    const response = await getHistory("", order.id, {}, { skipAuthHeader: true });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("zwraca 404 dla nieistniejącego zlecenia", async () => {
    const { token } = await setupDefaultOrderData();
    const response = await getHistory(token, "nonexistent-order-id");

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error.code).toBe("ORDER_NOT_FOUND");
  });

  it("zwraca ten sam 404 dla zlecenia z innego workspace'u co dla nieistniejącego", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    await createStaffUser(prisma, {
      workspaceSlug: "obca-klinika-history",
      workspaceName: "Obca Klinika Historia",
      login: "staff.obcy.history",
      password: "HasloTestowe123!"
    });
    const otherLoginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "staff.obcy.history", password: "HasloTestowe123!" }
    });
    const otherToken = JSON.parse(otherLoginResponse.body).token as string;

    const foreignResponse = await getHistory(otherToken, order.id);
    const missingResponse = await getHistory(otherToken, "nonexistent-order-id");

    expect(foreignResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(JSON.parse(foreignResponse.body).error.code).toBe(
      JSON.parse(missingResponse.body).error.code
    );
  });

  it("zawiera wpis utworzenia zlecenia bez wcześniejszych zdarzeń", async () => {
    const { token, userId, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "URGENT",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const response = await getHistory(token, order.id);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.items).toHaveLength(1);
    expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });

    const [entry] = body.items;
    expect(entry.eventType).toBe("ORDER_CREATED");
    expect(entry.actorType).toBe("STAFF");
    expect(entry.actorUserId).toBe(userId);
    expect(entry.previousStatus).toBeNull();
    expect(entry.newStatus).toBe("DRAFT");
    expect(entry.details).toEqual({
      eventType: "ORDER_CREATED",
      priority: "URGENT",
      testCodes: ["CRP"],
      requiredMaterials: ["SERUM"],
      finalStatus: "DRAFT"
    });
  });

  it("nie dodaje wpisu, gdy walidacja tworzenia zlecenia zostanie odrzucona", async () => {
    const { token, patientId } = await setupDefaultOrderData();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: { patientId, priority: "ROUTINE", tests: [] }
    });
    expect(response.statusCode).toBe(422);

    const countAfter = await prisma.orderHistory.count();
    expect(countAfter).toBe(0);
  });

  it("zawiera wpis edycji z listą zmienionych obszarów i bez danych pacjenta", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/orders/${order.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        priority: "URGENT",
        tests: [{ medicalTestId: tests.MORF.id }]
      }
    });
    expect(patchResponse.statusCode).toBe(200);

    const response = await getHistory(token, order.id);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(2);

    const updateEntry = body.items[0];
    expect(updateEntry.eventType).toBe("ORDER_UPDATED");
    expect(updateEntry.actorType).toBe("STAFF");
    expect(updateEntry.details).toEqual({
      eventType: "ORDER_UPDATED",
      changedFields: expect.arrayContaining(["priority", "tests"]),
      patientChanged: false,
      previousPriority: "ROUTINE",
      newPriority: "URGENT",
      addedTestCodes: ["MORF"],
      removedTestCodes: ["CRP"]
    });

    const responseText = response.body;
    expect(responseText).not.toMatch(/pesel/i);
    expect(responseText).not.toMatch(/firstName/i);
    expect(responseText).not.toMatch(/lastName/i);
  });

  it("nie dodaje wpisu dla PATCH bez rzeczywistej zmiany ani po nieudanej edycji", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const noChangeResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/orders/${order.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { priority: "ROUTINE" }
    });
    expect(noChangeResponse.statusCode).toBe(422);

    const invalidResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/orders/${order.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { tests: [] }
    });
    expect(invalidResponse.statusCode).toBe(422);

    const response = await getHistory(token, order.id);
    expect(JSON.parse(response.body).items).toHaveLength(1);
  });

  it("zawiera wpis rejestracji pojedynczej próbki z przejściem statusu", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-HIST-0001",
      collectedAt: nowIso()
    });

    const response = await getHistory(token, order.id);
    const body = JSON.parse(response.body);
    const entry = body.items[0];

    expect(entry.eventType).toBe("SAMPLE_REGISTERED");
    expect(entry.previousStatus).toBe("DRAFT");
    expect(entry.newStatus).toBe("SAMPLE_COLLECTED");
    expect(entry.details).toEqual({
      eventType: "SAMPLE_REGISTERED",
      materialType: "SERUM",
      sampleId: expect.any(String),
      previousOrderStatus: "DRAFT",
      newOrderStatus: "SAMPLE_COLLECTED"
    });
  });

  it("zawiera wpisy kolejnych próbek i zmianę statusu w prawidłowej kolejności", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
    });

    await registerSample(token, order.id, {
      materialType: "EDTA_BLOOD",
      barcode: "SMP-HIST-0002",
      collectedAt: nowIso()
    });
    await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-HIST-0003",
      collectedAt: nowIso()
    });

    const response = await getHistory(token, order.id);
    const body = JSON.parse(response.body);
    const sampleEntries = body.items.filter(
      (item: { eventType: string }) => item.eventType === "SAMPLE_REGISTERED"
    );
    expect(sampleEntries).toHaveLength(2);
    // Najnowsze zdarzenie pierwsze: druga próbka kończy kolekcję.
    expect(sampleEntries[0].newStatus).toBe("SAMPLE_COLLECTED");
    expect(sampleEntries[1].newStatus).toBe("SAMPLE_COLLECTION_IN_PROGRESS");
  });

  it("nie dodaje wpisu po nieudanej rejestracji próbki", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const failed = await registerSample(token, order.id, {
      materialType: "URINE",
      barcode: "SMP-HIST-FAIL",
      collectedAt: nowIso()
    });
    expect(failed.statusCode).toBe(422);

    const response = await getHistory(token, order.id);
    expect(JSON.parse(response.body).items).toHaveLength(1);
  });

  it("zawiera wpisy wysyłki i synchronicznego przyjęcia przez laboratorium bez duplikatu przy ponowieniu", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-HIST-0004",
      collectedAt: nowIso()
    });

    const correlationId = "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7";
    const first = await sendOrder(token, order.id, correlationId);
    expect(first.statusCode).toBe(200);
    const second = await sendOrder(token, order.id, correlationId);
    expect(second.statusCode).toBe(200);

    const response = await getHistory(token, order.id);
    const body = JSON.parse(response.body);

    const sentEntries = body.items.filter(
      (item: { eventType: string }) => item.eventType === "ORDER_SENT_TO_LAB"
    );
    const acceptedEntries = body.items.filter(
      (item: { eventType: string }) => item.eventType === "LAB_ORDER_ACCEPTED"
    );
    expect(sentEntries).toHaveLength(1);
    expect(acceptedEntries).toHaveLength(1);

    expect(sentEntries[0].correlationId).toBe(correlationId);
    expect(sentEntries[0].previousStatus).toBe("SAMPLE_COLLECTED");
    expect(sentEntries[0].newStatus).toBe("SENT_TO_LAB");
    expect(sentEntries[0].details.idempotencyKey).toEqual(expect.stringContaining(order.id));

    expect(acceptedEntries[0].actorType).toBe("LAB");
    expect(acceptedEntries[0].details.externalOrderId).toEqual(expect.stringMatching(/^EXT-/));
    expect(acceptedEntries[0].details.scenario).toBe("SUCCESS");
  });

  it("zawiera wpis odebrania wyniku i nie duplikuje go po ponownym callbacku z tym samym eventId", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-HIST-0005",
      collectedAt: nowIso()
    });
    const sendResponse = await sendOrder(token, order.id);
    const externalOrderId = JSON.parse(sendResponse.body).externalOrderId as string;

    const payload = {
      externalOrderId,
      eventId: "evt-history-crp",
      status: "COMPLETED" as const,
      results: [
        {
          medicalTestId: tests.CRP.id,
          parameters: [{ code: "CRP", value: "3.10", unit: "mg/L", flag: "NORMAL" as const }]
        }
      ],
      pendingMedicalTestIds: []
    };

    const first = await webhook(payload);
    expect(first.statusCode).toBe(204);
    const second = await webhook(payload);
    expect(second.statusCode).toBe(204);

    const response = await getHistory(token, order.id);
    const body = JSON.parse(response.body);
    const resultEntries = body.items.filter(
      (item: { eventType: string }) => item.eventType === "LAB_RESULT_RECEIVED"
    );

    expect(resultEntries).toHaveLength(1);
    expect(resultEntries[0].integrationEventId).toBe("evt-history-crp");
    expect(resultEntries[0].actorType).toBe("LAB");
    expect(resultEntries[0].newStatus).toBe("COMPLETED");
    expect(resultEntries[0].details).toEqual({
      eventType: "LAB_RESULT_RECEIVED",
      eventId: "evt-history-crp",
      externalOrderId,
      callbackStatus: "COMPLETED",
      resultCount: 1,
      testCodes: ["CRP"],
      previousStatus: "SENT_TO_LAB",
      newStatus: "COMPLETED"
    });

    const responseText = response.body;
    expect(responseText).not.toMatch(/"value":"3\.10"/);
  });

  it("pokazuje najnowsze zdarzenia jako pierwsze w spójnej kolejności biznesowej", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-HIST-0006",
      collectedAt: nowIso()
    });
    await sendOrder(token, order.id);

    const response = await getHistory(token, order.id);
    const eventTypes = JSON.parse(response.body).items.map(
      (item: { eventType: string }) => item.eventType
    );

    expect(eventTypes).toEqual([
      "LAB_ORDER_ACCEPTED",
      "ORDER_SENT_TO_LAB",
      "SAMPLE_REGISTERED",
      "ORDER_CREATED"
    ]);
  });

  it("sortuje stabilnie zdarzenia o identycznym occurredAt", async () => {
    const { token, workspaceId, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const sameInstant = new Date("2026-09-07T09:00:00.000Z");
    await prisma.orderHistory.create({
      data: {
        workspaceId,
        orderId: order.id,
        eventType: "TECHNICAL_ERROR",
        actorType: "SYSTEM",
        occurredAt: sameInstant,
        details: { reason: "test-a", previousStatus: "DRAFT", newStatus: "DRAFT" }
      }
    });
    await prisma.orderHistory.create({
      data: {
        workspaceId,
        orderId: order.id,
        eventType: "TECHNICAL_ERROR",
        actorType: "SYSTEM",
        occurredAt: sameInstant,
        details: { reason: "test-b", previousStatus: "DRAFT", newStatus: "DRAFT" }
      }
    });

    const first = await getHistory(token, order.id);
    const second = await getHistory(token, order.id);

    expect(JSON.parse(first.body).items.map((item: { id: string }) => item.id)).toEqual(
      JSON.parse(second.body).items.map((item: { id: string }) => item.id)
    );
  });

  it("obsługuje paginację", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    await registerSample(token, order.id, {
      materialType: "SERUM",
      barcode: "SMP-HIST-0007",
      collectedAt: nowIso()
    });
    await sendOrder(token, order.id);
    // Zdarzenia: ORDER_CREATED, SAMPLE_REGISTERED, ORDER_SENT_TO_LAB, LAB_ORDER_ACCEPTED = 4.

    const firstPage = await getHistory(token, order.id, { page: 1, pageSize: 2 });
    const firstBody = JSON.parse(firstPage.body);
    expect(firstBody.items).toHaveLength(2);
    expect(firstBody.meta).toEqual({ page: 1, pageSize: 2, total: 4, totalPages: 2 });

    const secondPage = await getHistory(token, order.id, { page: 2, pageSize: 2 });
    const secondBody = JSON.parse(secondPage.body);
    expect(secondBody.items).toHaveLength(2);

    const allIds = new Set([
      ...firstBody.items.map((item: { id: string }) => item.id),
      ...secondBody.items.map((item: { id: string }) => item.id)
    ]);
    expect(allIds.size).toBe(4);
  });

  it("odrzuca niepoprawne parametry paginacji", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const response = await getHistory(token, order.id, { pageSize: 500 });
    expect(response.statusCode).toBe(400);
  });

  it("prezentuje wpis odtworzony podczas migracji bez fałszywych szczegółów", async () => {
    const { token, userId, workspaceId, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    // Symulacja zlecenia sprzed wprowadzenia historii: usuwamy prawdziwy wpis
    // i odtwarzamy go tak, jak robi to backfill migracji.
    await prisma.orderHistory.deleteMany({ where: { orderId: order.id } });
    await prisma.orderHistory.create({
      data: {
        workspaceId,
        orderId: order.id,
        eventType: "ORDER_CREATED",
        actorType: "STAFF",
        actorUserId: userId,
        occurredAt: new Date(order.createdAt),
        previousStatus: null,
        newStatus: "DRAFT",
        details: { reconstructed: true }
      }
    });

    const response = await getHistory(token, order.id);
    const entry = JSON.parse(response.body).items[0];

    expect(entry.eventType).toBe("ORDER_CREATED");
    expect(entry.details).toEqual({ eventType: "ORDER_CREATED", reconstructed: true });
  });

  it("nie zwraca workspaceId w odpowiedzi", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const response = await getHistory(token, order.id);
    expect(response.body).not.toMatch(/workspaceId/);
  });

  it("wycofuje operację biznesową, gdy zapis historii się nie powiedzie", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const historyService = app.get(OrderHistoryService);
    const spy = jest
      .spyOn(historyService, "record")
      .mockRejectedValueOnce(new Error("zapis historii nieudany"));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      }
    });

    expect(response.statusCode).toBe(500);
    const ordersCount = await prisma.order.count();
    const orderTestsCount = await prisma.orderTest.count();
    const samplesCount = await prisma.sample.count();
    expect(ordersCount).toBe(0);
    expect(orderTestsCount).toBe(0);
    expect(samplesCount).toBe(0);

    spy.mockRestore();
  });

  it("publikuje endpoint historii w OpenAPI", async () => {
    const response = await app.inject({ method: "GET", url: "/api/docs-json" });
    expect(response.statusCode).toBe(200);
    const document = JSON.parse(response.body);
    const path = document.paths["/api/v1/orders/{orderId}/history"];
    expect(path).toBeDefined();
    expect(path.get).toBeDefined();
    expect(path.get.responses).toHaveProperty("200");
    expect(path.get.responses).toHaveProperty("400");
    expect(path.get.responses).toHaveProperty("401");
    expect(path.get.responses).toHaveProperty("404");
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
    payload: Record<string, unknown>
  ) {
    return app.inject({
      method: "POST",
      url: `/api/v1/orders/${orderId}/samples`,
      headers: { authorization: `Bearer ${token}` },
      payload
    });
  }

  async function sendOrder(token: string, orderId: string, correlationId?: string) {
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (correlationId) {
      headers["x-correlation-id"] = correlationId;
    }
    return app.inject({
      method: "POST",
      url: `/api/v1/orders/${orderId}/send`,
      headers
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

  async function getHistory(
    token: string,
    orderId: string,
    query: { page?: number; pageSize?: number } = {},
    options: { skipAuthHeader?: boolean } = {}
  ) {
    const search = new URLSearchParams();
    if (query.page !== undefined) {
      search.set("page", String(query.page));
    }
    if (query.pageSize !== undefined) {
      search.set("pageSize", String(query.pageSize));
    }
    const queryString = search.toString();

    return app.inject({
      method: "GET",
      url: `/api/v1/orders/${orderId}/history${queryString ? `?${queryString}` : ""}`,
      headers: options.skipAuthHeader ? {} : { authorization: `Bearer ${token}` }
    });
  }
});
