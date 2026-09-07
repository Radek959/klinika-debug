import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { LabJobsScheduler } from "../src/lab-jobs/lab-jobs.scheduler";
import { LabSendRetryScheduler } from "../src/lab-send-retry/lab-send-retry.scheduler";
import { LabSendRetryService } from "../src/lab-send-retry/lab-send-retry.service";
import { seedDatabase } from "../src/common/prisma/seed-database";
import { closeTestApp, createTestApp } from "./test-app";
import {
  configureTestEnvironment,
  createStaffUser,
  resetTestDatabase
} from "./database";

jest.setTimeout(30_000);

describe("orders send api — scenariusz SERVER_ERROR", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let labSendRetry: LabSendRetryService;
  let originalScenario: string | undefined;

  beforeAll(async () => {
    configureTestEnvironment();
    process.env.SEED_STAFF_PASSWORD = "SeedTestowe123!";
    originalScenario = process.env.LAB_SIMULATOR_SCENARIO;
    app = await createTestApp();
    prisma = app.get(PrismaService);
    labSendRetry = app.get(LabSendRetryService);
    app.get(LabJobsScheduler).onModuleDestroy();
    app.get(LabSendRetryScheduler).onModuleDestroy();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
    process.env.LAB_SIMULATOR_SCENARIO = "SERVER_ERROR";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalScenario === undefined) {
      delete process.env.LAB_SIMULATOR_SCENARIO;
    } else {
      process.env.LAB_SIMULATOR_SCENARIO = originalScenario;
    }
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it("zwraca początkowe 503 z jednolitym błędem, correlationId i Retry-After 15", async () => {
    const { token, orderId } = await createSendableOrder("SMP-SE-0001");
    const correlationId = "2bc21a9b-3e30-41da-9a4d-9afddfe0e501";

    const response = await sendOrder(token, orderId, { correlationId });

    expect(response.statusCode).toBe(503);
    expect(response.headers["retry-after"]).toBe("15");
    expect(response.headers["x-correlation-id"]).toBe(correlationId);
    expect(JSON.parse(response.body).error).toMatchObject({
      code: "LAB_SERVER_ERROR",
      message:
        "Laboratorium jest chwilowo niedostępne. Wysyłka zostanie ponowiona automatycznie.",
      correlationId
    });
  });

  it("pozostawia zlecenie w SAMPLE_COLLECTED i tworzy jeden trwały retry bez artefaktów przyjęcia", async () => {
    const { token, orderId } = await createSendableOrder("SMP-SE-0002");

    expect((await sendOrder(token, orderId)).statusCode).toBe(503);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("SAMPLE_COLLECTED");
    expect(order.externalOrderId).toBeNull();
    expect(order.sentAt).toBeNull();
    expect(order.estimatedCompletionAt).toBeNull();
    expect(await prisma.labJob.count({ where: { orderId } })).toBe(0);
    expect(await prisma.result.count({ where: { orderId } })).toBe(0);

    const job = await prisma.labSendRetryJob.findFirstOrThrow({ where: { orderId } });
    expect(job.status).toBe("PENDING");
    expect(job.attemptNumber).toBe(2);
    expect(job.scenario).toBe("SERVER_ERROR");
    expect(job.idempotencyKey).toBe(`send-${orderId}`);
    expect(JSON.stringify(job)).not.toContain("SMP-SE-0002");

    const key = await prisma.idempotencyKey.findFirstOrThrow({ where: { orderId } });
    expect(key.responseStatus).toBe(503);
    expect(key.responseBody).toMatchObject({
      state: "PENDING_SEND_RETRY",
      attemptNumber: 2
    });
  });

  it("wykonuje trzy automatyczne ponowienia 15/30/60 na tym samym zadaniu i kończy TECHNICAL_ERROR", async () => {
    const { token, orderId } = await createSendableOrder("SMP-SE-0003");
    expect((await sendOrder(token, orderId)).statusCode).toBe(503);

    let job = await prisma.labSendRetryJob.findFirstOrThrow({ where: { orderId } });
    expect(job.attemptNumber).toBe(2);

    await makeRetryJobDue(orderId);
    expect(await labSendRetry.processDueJobs(new Date())).toBe(1);
    job = await prisma.labSendRetryJob.findFirstOrThrow({ where: { orderId } });
    expect(job.status).toBe("PENDING");
    expect(job.attemptNumber).toBe(3);

    await makeRetryJobDue(orderId);
    expect(await labSendRetry.processDueJobs(new Date())).toBe(1);
    job = await prisma.labSendRetryJob.findFirstOrThrow({ where: { orderId } });
    expect(job.status).toBe("PENDING");
    expect(job.attemptNumber).toBe(4);

    await makeRetryJobDue(orderId);
    expect(await labSendRetry.processDueJobs(new Date())).toBe(1);

    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(finalOrder.status).toBe("TECHNICAL_ERROR");
    expect(finalOrder.externalOrderId).toBeNull();
    expect(finalOrder.sentAt).toBeNull();
    expect(await prisma.labJob.count({ where: { orderId } })).toBe(0);
    expect(await prisma.result.count({ where: { orderId } })).toBe(0);

    job = await prisma.labSendRetryJob.findFirstOrThrow({ where: { orderId } });
    expect(job.status).toBe("FAILED");
    expect(job.attemptNumber).toBe(4);
    expect(await labSendRetry.processDueJobs(new Date())).toBe(0);

    const key = await prisma.idempotencyKey.findFirstOrThrow({ where: { orderId } });
    expect(key.responseStatus).toBe(503);
    expect(key.responseBody).toMatchObject({
      state: "TECHNICAL_ERROR",
      attemptNumber: 4
    });
  });

  it("zapisuje bezpieczną historię prób i wyczerpania ze wspólnym correlationId", async () => {
    const { token, orderId, patient } = await createSendableOrder("SMP-SE-0004");
    const correlationId = "fd25987b-fb3a-4ba1-b383-ee2de3690097";
    expect((await sendOrder(token, orderId, { correlationId })).statusCode).toBe(503);
    await runAllRetries(orderId);

    const entries = await prisma.orderHistory.findMany({
      where: { orderId, eventType: { in: ["LAB_SEND_RETRY", "TECHNICAL_ERROR"] } },
      orderBy: { sequence: "asc" }
    });

    expect(entries.map((entry) => entry.eventType)).toEqual([
      "LAB_SEND_RETRY",
      "LAB_SEND_RETRY",
      "LAB_SEND_RETRY",
      "LAB_SEND_RETRY",
      "TECHNICAL_ERROR"
    ]);
    expect(entries.map((entry) => entry.correlationId)).toEqual(
      Array.from({ length: 5 }, () => correlationId)
    );
    expect(entries.map((entry) => (entry.details as { outcome?: string }).outcome)).toEqual([
      "SCHEDULED",
      "FAILED_RETRY",
      "FAILED_RETRY",
      "EXHAUSTED",
      undefined
    ]);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/orders/${orderId}/history`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('"scenario"');
    expect(response.body).not.toContain(':"SERVER_ERROR"');
    expect(response.body).not.toContain("SMP-SE-0004");
    expect(response.body).not.toContain(patient.lastName);
    if (patient.pesel) {
      expect(response.body).not.toContain(patient.pesel);
    }
  });

  it("ręczne powtórzenia i równoległe żądania nie tworzą duplikatów", async () => {
    const { token, orderId } = await createSendableOrder("SMP-SE-0005");

    const [first, second] = await Promise.all([sendOrder(token, orderId), sendOrder(token, orderId)]);
    const third = await sendOrder(token, orderId);

    expect(first.statusCode).toBe(503);
    expect(second.statusCode).toBe(503);
    expect(third.statusCode).toBe(503);
    expect(await prisma.labSendRetryJob.count({ where: { orderId } })).toBe(1);
    expect(await prisma.idempotencyKey.count({ where: { orderId } })).toBe(1);
    expect(
      await prisma.orderHistory.count({ where: { orderId, eventType: "LAB_SEND_RETRY" } })
    ).toBe(1);
  });

  it("ten sam klucz z innym hashem zwraca 409, a po wyczerpaniu prób ten sam klucz zwraca terminalny 503", async () => {
    const { token, orderId } = await createSendableOrder("SMP-SE-0006");
    expect((await sendOrder(token, orderId)).statusCode).toBe(503);

    await prisma.sample.updateMany({
      where: { orderId },
      data: { barcode: "SMP-SE-0006-INNY" }
    });
    const conflict = await sendOrder(token, orderId);
    expect(conflict.statusCode).toBe(409);
    expect(JSON.parse(conflict.body).error.code).toBe("IDEMPOTENCY_KEY_CONFLICT");

    await prisma.sample.updateMany({
      where: { orderId },
      data: { barcode: "SMP-SE-0006-0" }
    });
    await runAllRetries(orderId);

    const terminal = await sendOrder(token, orderId);
    expect(terminal.statusCode).toBe(503);
    expect(JSON.parse(terminal.body).error.code).toBe("LAB_SERVER_ERROR");
    expect(terminal.headers["retry-after"]).toBeUndefined();
  });

  it("awaria workera nie zużywa próby biznesowej ani nie zamyka zlecenia", async () => {
    const { token, orderId } = await createSendableOrder("SMP-SE-0007");
    expect((await sendOrder(token, orderId)).statusCode).toBe(503);
    await makeRetryJobDue(orderId);

    jest.spyOn(prisma.order, "findFirst").mockRejectedValueOnce(new Error("Awaria bazy"));

    expect(await labSendRetry.processDueJobs(new Date())).toBe(1);

    const job = await prisma.labSendRetryJob.findFirstOrThrow({ where: { orderId } });
    expect(job.status).toBe("PENDING");
    expect(job.attemptNumber).toBe(2);
    expect(job.lastError).toBe("Techniczny błąd wykonania zadania ponowienia wysyłki.");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      "SAMPLE_COLLECTED"
    );
  });

  it("anuluje zadanie po dezaktywacji pacjenta lub zmianie hasha bez wywołania symulatora", async () => {
    const first = await createSendableOrder("SMP-SE-0008");
    expect((await sendOrder(first.token, first.orderId)).statusCode).toBe(503);
    await prisma.patient.update({ where: { id: first.patient.id }, data: { active: false } });
    await makeRetryJobDue(first.orderId);
    expect(await labSendRetry.processDueJobs(new Date())).toBe(1);
    expect(await prisma.labSendRetryJob.count({ where: { orderId: first.orderId } })).toBe(0);
    expect(await prisma.idempotencyKey.count({ where: { orderId: first.orderId } })).toBe(0);

    const second = await createSendableOrder("SMP-SE-0009");
    expect((await sendOrder(second.token, second.orderId)).statusCode).toBe(503);
    await prisma.sample.updateMany({
      where: { orderId: second.orderId },
      data: { barcode: "SMP-SE-0009-INNY" }
    });
    await makeRetryJobDue(second.orderId);
    expect(await labSendRetry.processDueJobs(new Date())).toBe(1);
    expect(await prisma.labSendRetryJob.count({ where: { orderId: second.orderId } })).toBe(0);
    expect(await prisma.idempotencyKey.count({ where: { orderId: second.orderId } })).toBe(0);
  });

  it("respektuje izolację workspace'ów", async () => {
    const { orderId } = await createSendableOrder("SMP-SE-0010");
    const { user } = await createStaffUser(prisma, {
      workspaceSlug: "obca-klinika-server-error",
      workspaceName: "Obca Klinika Server Error",
      login: "staff.obcy.servererror",
      password: "HasloTestowe123!"
    });
    const otherLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: user.login, password: "HasloTestowe123!" }
    });
    const otherToken = JSON.parse(otherLogin.body).token as string;

    const response = await sendOrder(otherToken, orderId);

    expect(response.statusCode).toBe(404);
    expect(await prisma.labSendRetryJob.count({ where: { orderId } })).toBe(0);
    expect(await prisma.idempotencyKey.count({ where: { orderId } })).toBe(0);
  });

  it("dokumentuje w OpenAPI odpowiedź 503 bez ujawniania sposobu aktywacji scenariusza", async () => {
    const response = await app.inject({ method: "GET", url: "/api/docs-json" });
    const document = JSON.parse(response.body);
    const send = document.paths["/api/v1/orders/{orderId}/send"].post;

    expect(send.responses["503"]).toBeDefined();
    const serialized = JSON.stringify(send.responses["503"]);
    expect(serialized).toContain("LAB_SERVER_ERROR");
    expect(serialized).toContain("correlationId");
    expect(send.responses["503"].headers["Retry-After"]).toBeDefined();
    expect(send.responses["503"].headers["X-Correlation-ID"]).toBeDefined();
    expect(serialized).not.toContain("LAB_SIMULATOR_SCENARIO");
  });

  async function runAllRetries(orderId: string) {
    for (let index = 0; index < 3; index += 1) {
      await makeRetryJobDue(orderId);
      expect(await labSendRetry.processDueJobs(new Date())).toBe(1);
    }
  }

  async function makeRetryJobDue(orderId: string) {
    await prisma.labSendRetryJob.updateMany({
      where: { orderId },
      data: { executeAt: new Date(Date.now() - 1_000) }
    });
  }

  async function login() {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "staff.demo", password: "SeedTestowe123!" }
    });
    expect(response.statusCode).toBe(200);
    return JSON.parse(response.body).token as string;
  }

  async function createSendableOrder(barcodePrefix: string, testCodes: string[] = ["CRP"]) {
    const token = await login();
    const user = await prisma.user.findUniqueOrThrow({ where: { login: "staff.demo" } });
    const patient = await prisma.patient.findFirstOrThrow({
      where: { workspaceId: user.workspaceId, active: true }
    });
    const medicalTests = await prisma.medicalTest.findMany({
      where: { code: { in: testCodes } }
    });
    expect(medicalTests).toHaveLength(testCodes.length);

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        patientId: patient.id,
        priority: "ROUTINE",
        tests: medicalTests.map((test) => ({ medicalTestId: test.id }))
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const orderId = JSON.parse(createResponse.body).id as string;

    const samples = await prisma.sample.findMany({
      where: { orderId },
      orderBy: { materialType: "asc" }
    });
    for (const [index, sample] of samples.entries()) {
      const sampleResponse = await app.inject({
        method: "POST",
        url: `/api/v1/orders/${orderId}/samples`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          materialType: sample.materialType,
          barcode: `${barcodePrefix}-${index}`,
          collectedAt: new Date().toISOString()
        }
      });
      expect(sampleResponse.statusCode).toBe(200);
    }

    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      "SAMPLE_COLLECTED"
    );

    return { token, orderId, patient };
  }

  async function sendOrder(
    token: string,
    orderId: string,
    options: { correlationId?: string } = {}
  ) {
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
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
