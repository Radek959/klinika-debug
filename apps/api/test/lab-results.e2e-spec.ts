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
    expect(completedOrder.correlationId).not.toBeNull();

    const resultCount = await prisma.result.count({ where: { orderId: order.id } });
    expect(resultCount).toBe(1);

    const labJob = await waitForLabJobStatus(order.id, "DONE", 8000);
    const jobPayload = labJob.payload as unknown as { correlationId: string | null };
    expect(jobPayload.correlationId).not.toBeNull();
    expect(jobPayload.correlationId).toBe(completedOrder.correlationId);

    const resultReceivedEvent = await prisma.orderHistory.findFirstOrThrow({
      where: { orderId: order.id, eventType: "LAB_RESULT_RECEIVED" }
    });
    expect(resultReceivedEvent.correlationId).not.toBeNull();
    expect(resultReceivedEvent.correlationId).toBe(completedOrder.correlationId);
  });

  describe("scenariusz symulatora PARTIAL_SUCCESS", () => {
    const ORIGINAL_SCENARIO = process.env.LAB_SIMULATOR_SCENARIO;

    afterEach(() => {
      if (ORIGINAL_SCENARIO === undefined) {
        delete process.env.LAB_SIMULATOR_SCENARIO;
      } else {
        process.env.LAB_SIMULATOR_SCENARIO = ORIGINAL_SCENARIO;
      }
    });

    it("przechodzi SENT_TO_LAB -> PARTIAL -> COMPLETED przez dwa zaplanowane zadania lab_jobs", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, order.id, {
        materialType: "EDTA_BLOOD",
        barcode: "SMP-PARTIAL-0001",
        collectedAt: nowIso()
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-PARTIAL-0002",
        collectedAt: nowIso()
      });

      process.env.LAB_SIMULATOR_SCENARIO = "PARTIAL_SUCCESS";
      const sendResponse = await sendOrder(token, order.id);
      expect(sendResponse.statusCode).toBe(200);
      const sendBody = JSON.parse(sendResponse.body);
      expect(sendBody.status).toBe("SENT_TO_LAB");

      const sentOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(sentOrder.correlationId).not.toBeNull();
      expect(sentOrder.correlationId).not.toBe("");

      const jobs = await prisma.labJob.findMany({
        where: { orderId: order.id },
        orderBy: { executeAt: "asc" }
      });
      expect(jobs).toHaveLength(2);
      expect(jobs.every((job) => job.scenario === "PARTIAL_SUCCESS")).toBe(true);
      expect(jobs[0].executeAt.getTime()).toBeLessThan(jobs[1].executeAt.getTime());

      const firstPayload = jobs[0].payload as unknown as {
        eventId: string;
        status: string;
        correlationId: string | null;
        pendingMedicalTestIds: string[];
        results: Array<{ medicalTestId: string }>;
      };
      const secondPayload = jobs[1].payload as unknown as {
        eventId: string;
        status: string;
        correlationId: string | null;
        pendingMedicalTestIds: string[];
        results: Array<{ medicalTestId: string }>;
      };
      expect(firstPayload.status).toBe("PARTIAL");
      expect(secondPayload.status).toBe("COMPLETED");
      expect(firstPayload.eventId).not.toBe(secondPayload.eventId);
      expect(firstPayload.results.length).toBeGreaterThan(0);
      expect(firstPayload.results.length).toBeLessThan(2);
      expect(secondPayload.pendingMedicalTestIds).toEqual([]);
      const allTestIds = [
        ...firstPayload.results.map((r) => r.medicalTestId),
        ...secondPayload.results.map((r) => r.medicalTestId)
      ].sort();
      expect(allTestIds).toEqual([tests.CRP.id, tests.MORF.id].sort());

      // Oba zaplanowane callbacki muszą mieć dokładnie ten sam correlationId
      // co Order.correlationId zapisany podczas wysyłki — nie może to być null.
      expect(firstPayload.correlationId).not.toBeNull();
      expect(firstPayload.correlationId).toBe(sentOrder.correlationId);
      expect(secondPayload.correlationId).toBe(sentOrder.correlationId);

      await waitForOrderStatus(order.id, "PARTIAL", 8000);
      const afterFirstJob = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(afterFirstJob.status).toBe("PARTIAL");

      const resultsAfterFirstJob = await prisma.result.findMany({ where: { orderId: order.id } });
      expect(resultsAfterFirstJob.length).toBeGreaterThan(0);

      const detailsAfterPartial = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${order.id}`,
        headers: { authorization: `Bearer ${token}` }
      });
      expect(detailsAfterPartial.statusCode).toBe(200);
      expect(JSON.parse(detailsAfterPartial.body).results.length).toBeGreaterThan(0);

      const completedOrder = await waitForOrderStatus(order.id, "COMPLETED", 8000);
      expect(completedOrder.status).toBe("COMPLETED");

      const finalResults = await prisma.result.findMany({ where: { orderId: order.id } });
      const finalResultTestIds = new Set(finalResults.map((result) => result.medicalTestId));
      expect(finalResultTestIds.has(tests.CRP.id)).toBe(true);
      expect(finalResultTestIds.has(tests.MORF.id)).toBe(true);

      for (const partialResult of resultsAfterFirstJob) {
        const stillPresent = finalResults.find(
          (result) =>
            result.medicalTestId === partialResult.medicalTestId &&
            result.parameterCode === partialResult.parameterCode
        );
        expect(stillPresent?.value).toBe(partialResult.value);
      }

      const orderTests = await prisma.orderTest.findMany({ where: { orderId: order.id } });
      expect(orderTests.every((orderTest) => orderTest.status === "COMPLETED")).toBe(true);

      const doneJobs = await waitForAllLabJobsStatus(order.id, "DONE", 8000);
      expect(doneJobs).toHaveLength(2);

      const historyEvents = await prisma.orderHistory.findMany({
        where: { orderId: order.id },
        orderBy: { sequence: "asc" }
      });
      const eventTypes = historyEvents.map((event) => event.eventType);
      expect(eventTypes.filter((type) => type === "LAB_RESULT_RECEIVED")).toHaveLength(2);
      const partialTransition = historyEvents.find(
        (event) => event.previousStatus === "SENT_TO_LAB" && event.newStatus === "PARTIAL"
      );
      const completionTransition = historyEvents.find(
        (event) => event.previousStatus === "PARTIAL" && event.newStatus === "COMPLETED"
      );
      expect(partialTransition).toBeDefined();
      expect(completionTransition).toBeDefined();

      const resultReceivedEvents = historyEvents.filter(
        (event) => event.eventType === "LAB_RESULT_RECEIVED"
      );
      expect(resultReceivedEvents.every((event) => event.correlationId !== null)).toBe(true);
      expect(resultReceivedEvents.every((event) => event.correlationId === sentOrder.correlationId)).toBe(
        true
      );
    }, 15000);

    it("nie tworzy dodatkowych zadań przy ponownej wysyłce z tym samym kluczem idempotencji", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, order.id, {
        materialType: "EDTA_BLOOD",
        barcode: "SMP-PARTIAL-0003",
        collectedAt: nowIso()
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-PARTIAL-0004",
        collectedAt: nowIso()
      });

      process.env.LAB_SIMULATOR_SCENARIO = "PARTIAL_SUCCESS";
      const first = await sendOrder(token, order.id);
      expect(first.statusCode).toBe(200);
      const second = await sendOrder(token, order.id);
      expect(second.statusCode).toBe(200);

      const jobCount = await prisma.labJob.count({ where: { orderId: order.id } });
      expect(jobCount).toBe(2);
    });

    it("nie duplikuje wyników ani historii przy ponownym przetworzeniu tego samego eventId zadania częściowego", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, order.id, {
        materialType: "EDTA_BLOOD",
        barcode: "SMP-PARTIAL-0005",
        collectedAt: nowIso()
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-PARTIAL-0006",
        collectedAt: nowIso()
      });

      process.env.LAB_SIMULATOR_SCENARIO = "PARTIAL_SUCCESS";
      const sendResponse = await sendOrder(token, order.id);
      const externalOrderId = JSON.parse(sendResponse.body).externalOrderId as string;

      const partialJob = await prisma.labJob.findFirstOrThrow({
        where: { orderId: order.id },
        orderBy: { executeAt: "asc" }
      });
      const partialPayload = partialJob.payload as unknown as Record<string, unknown>;

      const firstDelivery = await webhook(partialPayload);
      expect(firstDelivery.statusCode).toBe(204);
      const resultCountAfterFirstDelivery = await prisma.result.count({
        where: { orderId: order.id }
      });
      expect(resultCountAfterFirstDelivery).toBeGreaterThan(0);

      const duplicateDelivery = await webhook(partialPayload);
      expect(duplicateDelivery.statusCode).toBe(204);

      const resultCount = await prisma.result.count({ where: { orderId: order.id } });
      expect(resultCount).toBe(resultCountAfterFirstDelivery);

      const eventCount = await prisma.processedLabEvent.count({
        where: { orderId: order.id, eventId: partialPayload.eventId as string }
      });
      expect(eventCount).toBe(1);

      const receivedEventsCount = await prisma.orderHistory.count({
        where: { orderId: order.id, eventType: "LAB_RESULT_RECEIVED" }
      });
      expect(receivedEventsCount).toBe(1);

      const orderAfterDuplicate = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(orderAfterDuplicate.status).toBe("PARTIAL");
      expect(externalOrderId).toBe(orderAfterDuplicate.externalOrderId);
    });

    it("stosuje fallback do SUCCESS dla zlecenia z jednym badaniem zamiast sztucznego wyniku PARTIAL", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-PARTIAL-0007",
        collectedAt: nowIso()
      });

      process.env.LAB_SIMULATOR_SCENARIO = "PARTIAL_SUCCESS";
      const sendResponse = await sendOrder(token, order.id);
      expect(sendResponse.statusCode).toBe(200);

      const sentOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

      const jobs = await prisma.labJob.findMany({ where: { orderId: order.id } });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].scenario).toBe("SUCCESS");
      const payload = jobs[0].payload as unknown as {
        status: string;
        correlationId: string | null;
        pendingMedicalTestIds: string[];
      };
      expect(payload.status).toBe("COMPLETED");
      expect(payload.pendingMedicalTestIds).toEqual([]);
      expect(payload.correlationId).not.toBeNull();
      expect(payload.correlationId).toBe(sentOrder.correlationId);

      const completedOrder = await waitForOrderStatus(order.id, "COMPLETED", 8000);
      expect(completedOrder.status).toBe("COMPLETED");
    });

    it("nie zmienia zachowania scenariusza SUCCESS, gdy LAB_SIMULATOR_SCENARIO=SUCCESS", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, order.id, {
        materialType: "EDTA_BLOOD",
        barcode: "SMP-PARTIAL-0008",
        collectedAt: nowIso()
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-PARTIAL-0009",
        collectedAt: nowIso()
      });

      process.env.LAB_SIMULATOR_SCENARIO = "SUCCESS";
      const sendResponse = await sendOrder(token, order.id);
      expect(sendResponse.statusCode).toBe(200);

      const jobs = await prisma.labJob.findMany({ where: { orderId: order.id } });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].scenario).toBe("SUCCESS");

      const completedOrder = await waitForOrderStatus(order.id, "COMPLETED", 8000);
      expect(completedOrder.status).toBe("COMPLETED");
    });

    it("izoluje zadania PARTIAL_SUCCESS między workspace'ami", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, order.id, {
        materialType: "EDTA_BLOOD",
        barcode: "SMP-PARTIAL-0010",
        collectedAt: nowIso()
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-PARTIAL-0011",
        collectedAt: nowIso()
      });

      process.env.LAB_SIMULATOR_SCENARIO = "PARTIAL_SUCCESS";
      const sendResponse = await sendOrder(token, order.id);
      expect(sendResponse.statusCode).toBe(200);

      const otherWorkspace = await prisma.workspace.create({
        data: { slug: "obca-klinika-partial", name: "Obca Klinika Partial" }
      });

      const jobsInOwnWorkspace = await prisma.labJob.count({
        where: { orderId: order.id, workspaceId: { not: otherWorkspace.id } }
      });
      const jobsLeakedToOtherWorkspace = await prisma.labJob.count({
        where: { workspaceId: otherWorkspace.id }
      });
      expect(jobsInOwnWorkspace).toBe(2);
      expect(jobsLeakedToOtherWorkspace).toBe(0);

      await waitForOrderStatus(order.id, "COMPLETED", 8000);
      const resultsLeakedToOtherWorkspace = await prisma.result.count({
        where: { workspaceId: otherWorkspace.id }
      });
      const historyLeakedToOtherWorkspace = await prisma.orderHistory.count({
        where: { workspaceId: otherWorkspace.id }
      });
      expect(resultsLeakedToOtherWorkspace).toBe(0);
      expect(historyLeakedToOtherWorkspace).toBe(0);
    });
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

  // Order.status przechodzi na docelową wartość wewnątrz transakcji
  // LabCallbacksService.processResults, a LabJob.status jest ustawiany na
  // "DONE" dopiero po jej zakończeniu, osobnym zapytaniem w schedulerze.
  // Między tymi dwoma zapisami jest krótkie okno, więc odczyt LabJob musi
  // być odpytywany, a nie sprawdzany od razu po zaobserwowaniu statusu
  // zlecenia — inaczej test jest niedeterministycznie flaky.
  async function waitForLabJobStatus(orderId: string, status: string, timeoutMs: number) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const labJob = await prisma.labJob.findFirstOrThrow({ where: { orderId } });
      if (labJob.status === status) {
        return labJob;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Zadanie lab_jobs nie osiągnęło statusu ${status} w ciągu ${timeoutMs}ms.`);
  }

  async function waitForAllLabJobsStatus(orderId: string, status: string, timeoutMs: number) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const jobs = await prisma.labJob.findMany({ where: { orderId } });
      if (jobs.length > 0 && jobs.every((job) => job.status === status)) {
        return jobs;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Zadania lab_jobs nie osiągnęły statusu ${status} w ciągu ${timeoutMs}ms.`);
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
