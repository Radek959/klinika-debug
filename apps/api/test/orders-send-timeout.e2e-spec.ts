import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { LabJobsScheduler } from "../src/lab-jobs/lab-jobs.scheduler";
import { LabSendRetryScheduler } from "../src/lab-send-retry/lab-send-retry.scheduler";
import { LabSendRetryService } from "../src/lab-send-retry/lab-send-retry.service";
import { seedDatabase } from "../src/common/prisma/seed-database";
import { closeTestApp, createTestApp } from "./test-app";
import { configureTestEnvironment, resetTestDatabase } from "./database";

jest.setTimeout(30_000);

describe("orders send api — scenariusz TIMEOUT", () => {
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
    process.env.LAB_SIMULATOR_SCENARIO = "TIMEOUT";
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

  it("zwraca początkowe 504 z jednolitym błędem, correlationId i Retry-After 15", async () => {
    const { token, orderId } = await createSendableOrder("SMP-TO-0001");
    const correlationId = "2bc21a9b-3e30-41da-9a4d-9afddfe0e502";

    const response = await sendOrder(token, orderId, { correlationId });

    expect(response.statusCode).toBe(504);
    expect(response.headers["retry-after"]).toBe("15");
    expect(response.headers["x-correlation-id"]).toBe(correlationId);
    expect(JSON.parse(response.body).error).toMatchObject({
      code: "LAB_SEND_TIMEOUT",
      message:
        "Timeout wysyłki do laboratorium. Wysyłka zostanie ponowiona automatycznie.",
      correlationId
    });
  });

  it("pozostawia zlecenie w SAMPLE_COLLECTED i tworzy jeden trwały retry bez artefaktów przyjęcia", async () => {
    const { token, orderId } = await createSendableOrder("SMP-TO-0002");

    expect((await sendOrder(token, orderId)).statusCode).toBe(504);

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
    expect(job.scenario).toBe("TIMEOUT");
    expect(job.idempotencyKey).toBe(`send-${orderId}`);
    expect(JSON.stringify(job)).not.toContain("SMP-TO-0002");

    const key = await prisma.idempotencyKey.findFirstOrThrow({ where: { orderId } });
    expect(key.responseStatus).toBe(504);
    expect(key.responseBody).toMatchObject({
      state: "PENDING_SEND_RETRY",
      attemptNumber: 2
    });
  });

  it("wykonuje trzy automatyczne ponowienia 15/30/60 na tym samym zadaniu i kończy TECHNICAL_ERROR", async () => {
    const { token, orderId } = await createSendableOrder("SMP-TO-0003");
    expect((await sendOrder(token, orderId)).statusCode).toBe(504);

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
    expect(key.responseStatus).toBe(504);
    expect(key.responseBody).toMatchObject({
      state: "TECHNICAL_ERROR",
      attemptNumber: 4
    });
  });

  it("zapisuje bezpieczną historię prób i wyczerpania ze wspólnym correlationId", async () => {
    const { token, orderId, patient } = await createSendableOrder("SMP-TO-0004");
    const correlationId = "fd25987b-fb3a-4ba1-b383-ee2de3690098";
    expect((await sendOrder(token, orderId, { correlationId })).statusCode).toBe(504);
    await runAllRetries(orderId);

    const entries = await prisma.orderHistory.findMany({
      where: { orderId, eventType: { in: ["LAB_SEND_TIMEOUT_RECEIVED", "LAB_SEND_RETRY", "TECHNICAL_ERROR"] } },
      orderBy: { sequence: "asc" }
    });

    expect(entries.map((entry) => entry.eventType)).toEqual([
      "LAB_SEND_TIMEOUT_RECEIVED",
      "LAB_SEND_RETRY",
      "LAB_SEND_RETRY",
      "LAB_SEND_RETRY",
      "LAB_SEND_RETRY",
      "TECHNICAL_ERROR"
    ]);
    expect(entries.map((entry) => entry.correlationId)).toEqual(
      Array.from({ length: 6 }, () => correlationId)
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/orders/${orderId}/history`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('"scenario"');
    expect(response.body).not.toContain(':"TIMEOUT"');
    expect(response.body).not.toContain("SMP-TO-0004");
    expect(response.body).not.toContain(patient.lastName);
    if (patient.pesel) {
      expect(response.body).not.toContain(patient.pesel);
    }
  });

  it("ręczne powtórzenia i równoległe żądania nie tworzą duplikatów", async () => {
    const { token, orderId } = await createSendableOrder("SMP-TO-0005");

    const [first, second] = await Promise.all([sendOrder(token, orderId), sendOrder(token, orderId)]);
    const third = await sendOrder(token, orderId);

    expect(first.statusCode).toBe(504);
    expect(second.statusCode).toBe(504);
    expect(third.statusCode).toBe(504);
    expect(await prisma.labSendRetryJob.count({ where: { orderId } })).toBe(1);
    expect(await prisma.idempotencyKey.count({ where: { orderId } })).toBe(1);
    expect(
      await prisma.orderHistory.count({ where: { orderId, eventType: "LAB_SEND_TIMEOUT_RECEIVED" } })
    ).toBe(1);
  });

  it("ten sam klucz z innym hashem zwraca 409, a po wyczerpaniu prób ten sam klucz zwraca terminalny 504", async () => {
    const { token, orderId } = await createSendableOrder("SMP-TO-0006");
    expect((await sendOrder(token, orderId)).statusCode).toBe(504);

    // Zmiana danych zlecenia (kod kreskowy próbki) zmienia hash requestu
    // wysyłki — dokładnie ten sam mechanizm co w scenariuszach RATE_LIMIT
    // i SERVER_ERROR.
    await prisma.sample.updateMany({
      where: { orderId },
      data: { barcode: "SMP-TO-0006-INNY" }
    });

    const conflict = await sendOrder(token, orderId);
    expect(conflict.statusCode).toBe(409);
    expect(JSON.parse(conflict.body).error).toMatchObject({
      code: "IDEMPOTENCY_KEY_CONFLICT"
    });

    await prisma.sample.updateMany({
      where: { orderId },
      data: { barcode: "SMP-TO-0006" }
    });
    await runAllRetries(orderId);

    const finalConflict = await sendOrder(token, orderId);
    expect(finalConflict.statusCode).toBe(504);
    expect(JSON.parse(finalConflict.body).error).toMatchObject({
      code: "LAB_SEND_TIMEOUT",
      message:
        "Laboratorium pozostaje niedostępne po automatycznych ponowieniach. Zlecenie oznaczono jako błąd techniczny."
    });
  });

  async function login() {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "staff.demo", password: "SeedTestowe123!" }
    });
    expect(response.statusCode).toBe(200);
    return JSON.parse(response.body).token as string;
  }

  async function createSendableOrder(barcode: string) {
    const token = await login();
    const user = await prisma.user.findUniqueOrThrow({ where: { login: "staff.demo" } });
    const patient = await prisma.patient.findFirstOrThrow({
      where: { workspaceId: user.workspaceId, active: true }
    });

    const testId = await prisma.medicalTest.findFirstOrThrow({
      where: { active: true, code: "CRP" },
      select: { id: true }
    });

    const order = await app.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        patientId: patient.id,
        priority: "ROUTINE",
        tests: [{ medicalTestId: testId.id }]
      }
    });
    expect(order.statusCode).toBe(201);

    const orderId = JSON.parse(order.body).id as string;

    const sampleResponse = await app.inject({
      method: "POST",
      url: `/api/v1/orders/${orderId}/samples`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        materialType: "SERUM",
        barcode,
        collectedAt: new Date().toISOString()
      }
    });
    expect(sampleResponse.statusCode).toBe(200);
    expect(JSON.parse(sampleResponse.body).status).toBe("SAMPLE_COLLECTED");

    return { token, orderId, patient };
  }

  async function sendOrder(
    token: string,
    orderId: string,
    overrides?: { correlationId?: string; additionalData?: Record<string, unknown> }
  ) {
    return app.inject({
      method: "POST",
      url: `/api/v1/orders/${orderId}/send`,
      headers: {
        authorization: `Bearer ${token}`,
        ...(overrides?.correlationId && { "x-correlation-id": overrides.correlationId })
      },
      payload: overrides?.additionalData ?? {}
    });
  }

  async function makeRetryJobDue(orderId: string) {
    const job = await prisma.labSendRetryJob.findFirstOrThrow({ where: { orderId } });
    await prisma.labSendRetryJob.update({
      where: { id: job.id },
      data: { executeAt: new Date(0) }
    });
  }

  async function runAllRetries(orderId: string) {
    for (let i = 0; i < 4; i++) {
      await makeRetryJobDue(orderId);
      await labSendRetry.processDueJobs(new Date());
    }
  }
});
