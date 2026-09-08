import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { seedDatabase } from "../src/common/prisma/seed-database";
import { OrderHistoryService } from "../src/order-history/order-history.service";
import { closeTestApp, createTestApp } from "./test-app";
import { configureTestEnvironment, resetTestDatabase, setWorkshopConfig } from "./database";

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

      await setWorkshopConfig(app, { labScenario: "PARTIAL_SUCCESS" });
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

      await setWorkshopConfig(app, { labScenario: "PARTIAL_SUCCESS" });
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

      await setWorkshopConfig(app, { labScenario: "PARTIAL_SUCCESS" });
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

      await setWorkshopConfig(app, { labScenario: "PARTIAL_SUCCESS" });
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

      await setWorkshopConfig(app, { labScenario: "SUCCESS" });
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

      await setWorkshopConfig(app, { labScenario: "PARTIAL_SUCCESS" });
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

  describe("scenariusz symulatora SAMPLE_REJECTED", () => {
    it("odrzuca jedyną próbkę zlecenia i kończy je statusem REJECTED", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }, { medicalTestId: tests.TSH.id }]
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-REJ-0001",
        collectedAt: nowIso()
      });

      await setWorkshopConfig(app, { labScenario: "SAMPLE_REJECTED" });
      const sendResponse = await sendOrder(token, order.id);
      expect(sendResponse.statusCode).toBe(200);
      const sentOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

      const jobs = await prisma.labJob.findMany({ where: { orderId: order.id } });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].scenario).toBe("SAMPLE_REJECTED");
      const payload = jobs[0].payload as unknown as {
        status: string;
        eventId: string;
        externalOrderId: string;
        correlationId: string | null;
        pendingMedicalTestIds: string[];
        results: unknown[];
        rejectedSamples: Array<{
          sampleId: string;
          rejectionCode: string;
          rejectionReason: string;
        }>;
      };
      expect(payload.status).toBe("REJECTED");
      expect(payload.externalOrderId).toBe(sentOrder.externalOrderId);
      expect(payload.pendingMedicalTestIds).toEqual([]);
      expect(payload.results).toEqual([]);
      expect(payload.rejectedSamples).toHaveLength(1);
      expect(payload.correlationId).not.toBeNull();
      expect(payload.correlationId).toBe(sentOrder.correlationId);
      expect(jobs[0].executeAt.getTime()).toBe(
        sentOrder.estimatedCompletionAt?.getTime()
      );

      const rejectedOrder = await waitForOrderStatus(order.id, "REJECTED", 8000);
      expect(rejectedOrder.status).toBe("REJECTED");

      const sample = await prisma.sample.findFirstOrThrow({ where: { orderId: order.id } });
      expect(sample.status).toBe("REJECTED");
      expect(sample.rejectionCode).toBe("INSUFFICIENT_VOLUME");
      expect(sample.rejectionReason).toBe("Niewystarczająca objętość próbki");

      const orderTests = await prisma.orderTest.findMany({ where: { orderId: order.id } });
      expect(orderTests).toHaveLength(2);
      expect(orderTests.every((orderTest) => orderTest.status === "REJECTED")).toBe(true);

      const resultCount = await prisma.result.count({ where: { orderId: order.id } });
      expect(resultCount).toBe(0);

      const historyEvent = await prisma.orderHistory.findFirstOrThrow({
        where: { orderId: order.id, eventType: "LAB_SAMPLE_REJECTED" }
      });
      expect(historyEvent.previousStatus).toBe("SENT_TO_LAB");
      expect(historyEvent.newStatus).toBe("REJECTED");
      expect(historyEvent.correlationId).toBe(sentOrder.correlationId);
      expect(historyEvent.integrationEventId).toBe(payload.eventId);

      const details = historyEvent.details as Record<string, unknown>;
      expect(details).toMatchObject({
        externalOrderId: sentOrder.externalOrderId,
        rejectedSamples: [
          {
            sampleId: sample.id,
            materialType: "SERUM",
            rejectionCode: "INSUFFICIENT_VOLUME",
            rejectionReason: "Niewystarczająca objętość próbki"
          }
        ],
        completedTestCodes: [],
        previousStatus: "SENT_TO_LAB",
        newStatus: "REJECTED"
      });
      expect((details.rejectedTestCodes as string[]).slice().sort()).toEqual(["CRP", "TSH"]);
      // Historia nie może zawierać danych wrażliwych ani pełnego payloadu.
      const serializedDetails = JSON.stringify(details);
      expect(serializedDetails).not.toContain("SMP-REJ-0001");
      expect(serializedDetails).not.toMatch(/pesel|firstName|lastName|secret|parameters/i);

      const detailsResponse = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${order.id}`,
        headers: { authorization: `Bearer ${token}` }
      });
      expect(detailsResponse.statusCode).toBe(200);
      const body = JSON.parse(detailsResponse.body);
      expect(body.status).toBe("REJECTED");
      expect(body.results).toEqual([]);
      expect(body.samples[0].rejectionCode).toBe("INSUFFICIENT_VOLUME");
      expect(body.tests.every((test: { status: string }) => test.status === "REJECTED")).toBe(
        true
      );
    }, 15000);

    it("odrzuca dokładnie jedną z wielu próbek i zapisuje wyniki dla pozostałych", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, order.id, {
        materialType: "EDTA_BLOOD",
        barcode: "SMP-REJ-0002",
        collectedAt: nowIso()
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-REJ-0003",
        collectedAt: nowIso()
      });

      await setWorkshopConfig(app, { labScenario: "SAMPLE_REJECTED" });
      const sendResponse = await sendOrder(token, order.id);
      expect(sendResponse.statusCode).toBe(200);

      const jobs = await prisma.labJob.findMany({ where: { orderId: order.id } });
      expect(jobs).toHaveLength(1);

      await waitForOrderStatus(order.id, "REJECTED", 8000);

      const samples = await prisma.sample.findMany({
        where: { orderId: order.id },
        orderBy: { materialType: "asc" }
      });
      const rejected = samples.filter((sample) => sample.status === "REJECTED");
      const accepted = samples.filter((sample) => sample.status === "ACCEPTED");
      expect(rejected).toHaveLength(1);
      expect(accepted).toHaveLength(1);
      // Deterministycznie odrzucana jest pierwsza próbka wg sortowania materiału.
      expect(rejected[0].materialType).toBe("EDTA_BLOOD");
      expect(rejected[0].rejectionCode).toBe("HEMOLYZED");
      expect(rejected[0].rejectionReason).toBe("Próbka zhemolizowana");
      expect(accepted[0].materialType).toBe("SERUM");
      expect(accepted[0].rejectionCode).toBeNull();

      const orderTests = await prisma.orderTest.findMany({ where: { orderId: order.id } });
      const byTestId = new Map(orderTests.map((test) => [test.medicalTestId, test.status]));
      expect(byTestId.get(tests.MORF.id)).toBe("REJECTED");
      expect(byTestId.get(tests.CRP.id)).toBe("COMPLETED");
      expect(orderTests.some((test) => test.status === "PENDING")).toBe(false);

      const results = await prisma.result.findMany({ where: { orderId: order.id } });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((result) => result.medicalTestId === tests.CRP.id)).toBe(true);

      const historyEvent = await prisma.orderHistory.findFirstOrThrow({
        where: { orderId: order.id, eventType: "LAB_SAMPLE_REJECTED" }
      });
      expect(historyEvent.details).toMatchObject({
        rejectedSamples: [
          {
            sampleId: rejected[0].id,
            materialType: "EDTA_BLOOD",
            rejectionCode: "HEMOLYZED",
            rejectionReason: "Próbka zhemolizowana"
          }
        ],
        completedTestCodes: ["CRP"],
        rejectedTestCodes: ["MORF"],
        newStatus: "REJECTED"
      });
    }, 15000);

    it("zachowuje wyniki odebrane przed odrzuceniem i przechodzi PARTIAL -> REJECTED", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, order.id, {
        materialType: "EDTA_BLOOD",
        barcode: "SMP-REJ-0004",
        collectedAt: nowIso()
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-REJ-0005",
        collectedAt: nowIso()
      });

      const sendResponse = await sendOrder(token, order.id);
      const externalOrderId = JSON.parse(sendResponse.body).externalOrderId as string;
      // Zadanie zaplanowane przez symulator nie może wyprzedzić ręcznych callbacków.
      await prisma.labJob.deleteMany({ where: { orderId: order.id } });

      const partial = await webhook({
        externalOrderId,
        eventId: "evt-rej-partial",
        status: "PARTIAL",
        results: [
          {
            medicalTestId: tests.CRP.id,
            parameters: [{ code: "CRP", value: "4.40", unit: "mg/L", flag: "NORMAL" }]
          }
        ],
        pendingMedicalTestIds: [tests.MORF.id]
      });
      expect(partial.statusCode).toBe(204);
      const afterPartial = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(afterPartial.status).toBe("PARTIAL");

      const bloodSample = await prisma.sample.findFirstOrThrow({
        where: { orderId: order.id, materialType: "EDTA_BLOOD" }
      });

      const rejection = await webhook({
        externalOrderId,
        eventId: "evt-rej-final",
        status: "REJECTED",
        results: [],
        pendingMedicalTestIds: [],
        rejectedSamples: [
          {
            sampleId: bloodSample.id,
            rejectionCode: "HEMOLYZED",
            rejectionReason: "Próbka zhemolizowana"
          }
        ]
      });
      expect(rejection.statusCode).toBe(204);

      const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(finalOrder.status).toBe("REJECTED");

      const results = await prisma.result.findMany({ where: { orderId: order.id } });
      expect(results).toHaveLength(1);
      expect(results[0].value).toBe("4.40");

      const orderTests = await prisma.orderTest.findMany({ where: { orderId: order.id } });
      const byTestId = new Map(orderTests.map((test) => [test.medicalTestId, test.status]));
      expect(byTestId.get(tests.CRP.id)).toBe("COMPLETED");
      expect(byTestId.get(tests.MORF.id)).toBe("REJECTED");

      const historyEvent = await prisma.orderHistory.findFirstOrThrow({
        where: { orderId: order.id, eventType: "LAB_SAMPLE_REJECTED" }
      });
      expect(historyEvent.previousStatus).toBe("PARTIAL");
      expect(historyEvent.newStatus).toBe("REJECTED");
    }, 15000);

    it("nie duplikuje skutków przy powtórzonym eventId callbacka REJECTED", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, order.id, {
        materialType: "EDTA_BLOOD",
        barcode: "SMP-REJ-0006",
        collectedAt: nowIso()
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-REJ-0007",
        collectedAt: nowIso()
      });

      await setWorkshopConfig(app, { labScenario: "SAMPLE_REJECTED" });
      const sendResponse = await sendOrder(token, order.id);
      expect(sendResponse.statusCode).toBe(200);

      const job = await prisma.labJob.findFirstOrThrow({ where: { orderId: order.id } });
      const payload = job.payload as unknown as Record<string, unknown>;
      await prisma.labJob.deleteMany({ where: { orderId: order.id } });

      const first = await webhook(payload);
      expect(first.statusCode).toBe(204);
      const resultsAfterFirst = await prisma.result.count({ where: { orderId: order.id } });
      const sampleAfterFirst = await prisma.sample.findFirstOrThrow({
        where: { orderId: order.id, status: "REJECTED" }
      });

      const duplicate = await webhook(payload);
      expect(duplicate.statusCode).toBe(204);

      expect(await prisma.result.count({ where: { orderId: order.id } })).toBe(
        resultsAfterFirst
      );
      expect(
        await prisma.processedLabEvent.count({
          where: { orderId: order.id, eventId: payload.eventId as string }
        })
      ).toBe(1);
      expect(
        await prisma.orderHistory.count({
          where: { orderId: order.id, eventType: "LAB_SAMPLE_REJECTED" }
        })
      ).toBe(1);

      const sampleAfterDuplicate = await prisma.sample.findUniqueOrThrow({
        where: { id: sampleAfterFirst.id }
      });
      expect(sampleAfterDuplicate.rejectionCode).toBe(sampleAfterFirst.rejectionCode);
      expect(sampleAfterDuplicate.rejectionReason).toBe(sampleAfterFirst.rejectionReason);
      expect(sampleAfterDuplicate.updatedAt).toEqual(sampleAfterFirst.updatedAt);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status
      ).toBe("REJECTED");
    }, 15000);

    it("odrzuca wszystkie próbki zlecenia wielomateriałowego i zapisuje ich komplet w historii", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, order.id, {
        materialType: "EDTA_BLOOD",
        barcode: "SMP-REJ-ALL-1",
        collectedAt: nowIso()
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-REJ-ALL-2",
        collectedAt: nowIso()
      });

      const sendResponse = await sendOrder(token, order.id);
      const externalOrderId = JSON.parse(sendResponse.body).externalOrderId as string;
      await prisma.labJob.deleteMany({ where: { orderId: order.id } });

      const samples = await prisma.sample.findMany({ where: { orderId: order.id } });
      const bloodSample = samples.find((sample) => sample.materialType === "EDTA_BLOOD")!;
      const serumSample = samples.find((sample) => sample.materialType === "SERUM")!;

      // Kontrakt dopuszcza odrzucenie wszystkich próbek jednym callbackiem,
      // niezależnie od tego, że symulator odrzuca dokładnie jedną.
      const response = await webhook({
        externalOrderId,
        eventId: "evt-rej-all",
        status: "REJECTED",
        results: [],
        pendingMedicalTestIds: [],
        rejectedSamples: [
          {
            sampleId: serumSample.id,
            rejectionCode: "INSUFFICIENT_VOLUME",
            rejectionReason: "Niewystarczająca objętość próbki"
          },
          {
            sampleId: bloodSample.id,
            rejectionCode: "HEMOLYZED",
            rejectionReason: "Próbka zhemolizowana"
          }
        ]
      });
      expect(response.statusCode).toBe(204);

      const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(persisted.status).toBe("REJECTED");

      const persistedSamples = await prisma.sample.findMany({
        where: { orderId: order.id }
      });
      expect(persistedSamples.every((sample) => sample.status === "REJECTED")).toBe(true);

      const orderTests = await prisma.orderTest.findMany({ where: { orderId: order.id } });
      expect(orderTests).toHaveLength(2);
      expect(orderTests.every((orderTest) => orderTest.status === "REJECTED")).toBe(true);
      expect(await prisma.result.count({ where: { orderId: order.id } })).toBe(0);

      // Jeden callback daje dokładnie jeden wpis historii z kompletem próbek.
      const historyEvents = await prisma.orderHistory.findMany({
        where: { orderId: order.id, eventType: "LAB_SAMPLE_REJECTED" }
      });
      expect(historyEvents).toHaveLength(1);

      const details = historyEvents[0].details as Record<string, unknown>;
      const rejectedSamples = details.rejectedSamples as Array<Record<string, string>>;
      expect(rejectedSamples).toHaveLength(2);
      // Kolejność jest deterministyczna (sortowanie po sampleId), a nie zależna
      // od kolejności elementów w payloadzie callbacka.
      expect(rejectedSamples.map((sample) => sample.sampleId)).toEqual(
        [bloodSample.id, serumSample.id].sort((left, right) => left.localeCompare(right))
      );
      expect(
        rejectedSamples.map((sample) => sample.materialType).sort()
      ).toEqual(["EDTA_BLOOD", "SERUM"]);
      expect(
        rejectedSamples.map((sample) => sample.rejectionCode).sort()
      ).toEqual(["HEMOLYZED", "INSUFFICIENT_VOLUME"]);
      expect(details.completedTestCodes).toEqual([]);
      expect((details.rejectedTestCodes as string[]).slice().sort()).toEqual(["CRP", "MORF"]);

      const serialized = JSON.stringify(details);
      expect(serialized).not.toContain("SMP-REJ-ALL-1");
      expect(serialized).not.toContain("SMP-REJ-ALL-2");
    }, 15000);

    describe("walidacja spójności odrzucenia próbek i badań", () => {
      async function prepareMultiMaterialOrder(barcodePrefix: string) {
        const { token, patientId, tests } = await setupDefaultOrderData();
        const order = await createOrderAndParse(token, {
          patientId,
          priority: "ROUTINE",
          tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
        });
        await registerSample(token, order.id, {
          materialType: "EDTA_BLOOD",
          barcode: `${barcodePrefix}-A`,
          collectedAt: nowIso()
        });
        await registerSample(token, order.id, {
          materialType: "SERUM",
          barcode: `${barcodePrefix}-B`,
          collectedAt: nowIso()
        });
        const sendResponse = await sendOrder(token, order.id);
        const externalOrderId = JSON.parse(sendResponse.body).externalOrderId as string;
        await prisma.labJob.deleteMany({ where: { orderId: order.id } });

        const samples = await prisma.sample.findMany({ where: { orderId: order.id } });
        return {
          token,
          order,
          externalOrderId,
          tests,
          bloodSample: samples.find((sample) => sample.materialType === "EDTA_BLOOD")!,
          serumSample: samples.find((sample) => sample.materialType === "SERUM")!
        };
      }

      /** Niespójny callback nie może zostawić w bazie żadnego śladu. */
      async function expectNoDatabaseChange(orderId: string) {
        const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
        expect(order.status).toBe("SENT_TO_LAB");

        const samples = await prisma.sample.findMany({ where: { orderId } });
        expect(samples.every((sample) => sample.status !== "REJECTED")).toBe(true);
        expect(samples.every((sample) => sample.status !== "ACCEPTED")).toBe(true);
        expect(samples.every((sample) => sample.rejectionCode === null)).toBe(true);
        expect(samples.every((sample) => sample.rejectionReason === null)).toBe(true);

        const orderTests = await prisma.orderTest.findMany({ where: { orderId } });
        expect(orderTests.every((orderTest) => orderTest.status === "PENDING")).toBe(true);

        expect(await prisma.result.count({ where: { orderId } })).toBe(0);
        expect(await prisma.processedLabEvent.count({ where: { orderId } })).toBe(0);
        expect(
          await prisma.orderHistory.count({
            where: { orderId, eventType: "LAB_SAMPLE_REJECTED" }
          })
        ).toBe(0);
      }

      function expectValidationError(response: { statusCode: number; body: string }) {
        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe("LAB_CALLBACK_VALIDATION_ERROR");
        expect(body.error.correlationId).toBeTruthy();
      }

      it("odrzuca wynik badania spoza zlecenia", async () => {
        const { order, externalOrderId, bloodSample } =
          await prepareMultiMaterialOrder("SMP-CON-01");
        const foreignTest = await prisma.medicalTest.findFirstOrThrow({
          where: { code: "TSH" }
        });

        const response = await webhook({
          externalOrderId,
          eventId: "evt-con-unknown-test",
          status: "REJECTED",
          results: [
            {
              medicalTestId: foreignTest.id,
              parameters: [{ code: "TSH", value: "1.20", unit: "mIU/L", flag: "NORMAL" }]
            }
          ],
          pendingMedicalTestIds: [],
          rejectedSamples: [
            {
              sampleId: bloodSample.id,
              rejectionCode: "HEMOLYZED",
              rejectionReason: "Próbka zhemolizowana"
            }
          ]
        });

        expectValidationError(response);
        expect(JSON.parse(response.body).error.fieldErrors[0].code).toBe(
          "MEDICAL_TEST_NOT_IN_ORDER"
        );
        await expectNoDatabaseChange(order.id);
      });

      it("odrzuca zduplikowane badanie na liście wyników", async () => {
        const { order, externalOrderId, tests, bloodSample } =
          await prepareMultiMaterialOrder("SMP-CON-02");
        const crpResult = {
          medicalTestId: tests.CRP.id,
          parameters: [{ code: "CRP", value: "2.10", unit: "mg/L", flag: "NORMAL" }]
        };

        const response = await webhook({
          externalOrderId,
          eventId: "evt-con-duplicate-test",
          status: "REJECTED",
          results: [crpResult, { ...crpResult }],
          pendingMedicalTestIds: [],
          rejectedSamples: [
            {
              sampleId: bloodSample.id,
              rejectionCode: "HEMOLYZED",
              rejectionReason: "Próbka zhemolizowana"
            }
          ]
        });

        expectValidationError(response);
        expect(JSON.parse(response.body).error.fieldErrors[0].code).toBe(
          "DUPLICATE_MEDICAL_TEST_RESULT"
        );
        await expectNoDatabaseChange(order.id);
      });

      it("odrzuca wynik badania wykonanego z materiału oznaczonego jako odrzucony", async () => {
        const { order, externalOrderId, tests, bloodSample } =
          await prepareMultiMaterialOrder("SMP-CON-03");

        // MORF wymaga krwi EDTA, a ta sama próbka jest jednocześnie odrzucona.
        const response = await webhook({
          externalOrderId,
          eventId: "evt-con-result-rejected-material",
          status: "REJECTED",
          results: [
            {
              medicalTestId: tests.MORF.id,
              parameters: [{ code: "HGB", value: "13.5", unit: "g/dL", flag: "NORMAL" }]
            }
          ],
          pendingMedicalTestIds: [],
          rejectedSamples: [
            {
              sampleId: bloodSample.id,
              rejectionCode: "HEMOLYZED",
              rejectionReason: "Próbka zhemolizowana"
            }
          ]
        });

        expectValidationError(response);
        expect(JSON.parse(response.body).error.fieldErrors[0].code).toBe(
          "RESULT_FOR_REJECTED_MATERIAL"
        );
        await expectNoDatabaseChange(order.id);
      });

      it("odrzuca brak wyniku dla badania z nieodrzuconej próbki", async () => {
        const { order, externalOrderId, bloodSample } =
          await prepareMultiMaterialOrder("SMP-CON-04");

        // Odrzucona jest tylko krew EDTA, więc CRP z surowicy musi mieć wynik.
        const response = await webhook({
          externalOrderId,
          eventId: "evt-con-missing-result",
          status: "REJECTED",
          results: [],
          pendingMedicalTestIds: [],
          rejectedSamples: [
            {
              sampleId: bloodSample.id,
              rejectionCode: "HEMOLYZED",
              rejectionReason: "Próbka zhemolizowana"
            }
          ]
        });

        expectValidationError(response);
        expect(JSON.parse(response.body).error.fieldErrors[0].code).toBe(
          "MISSING_RESULT_FOR_ACCEPTED_MATERIAL"
        );
        await expectNoDatabaseChange(order.id);
      });

      it("nie pozwala pośrednio odrzucić badania korzystającego z nieodrzuconego materiału", async () => {
        const { order, externalOrderId, tests, serumSample } =
          await prepareMultiMaterialOrder("SMP-CON-05");

        // Odrzucona jest surowica, ale callback nie przekazuje wyniku MORF
        // z nieodrzuconej krwi EDTA — nie może go pośrednio unieważnić.
        const response = await webhook({
          externalOrderId,
          eventId: "evt-con-indirect-rejection",
          status: "REJECTED",
          results: [],
          pendingMedicalTestIds: [],
          rejectedSamples: [
            {
              sampleId: serumSample.id,
              rejectionCode: "INSUFFICIENT_VOLUME",
              rejectionReason: "Niewystarczająca objętość próbki"
            }
          ]
        });

        expectValidationError(response);
        expect(JSON.parse(response.body).error.fieldErrors[0].code).toBe(
          "MISSING_RESULT_FOR_ACCEPTED_MATERIAL"
        );
        await expectNoDatabaseChange(order.id);

        // Spójny wariant tego samego callbacka musi przejść w całości: MORF ma
        // wynik z nieodrzuconej krwi, a jego próbka zostaje ACCEPTED.
        const consistent = await webhook({
          externalOrderId,
          eventId: "evt-con-indirect-rejection-fixed",
          status: "REJECTED",
          results: [
            {
              medicalTestId: tests.MORF.id,
              parameters: [{ code: "HGB", value: "13.5", unit: "g/dL", flag: "NORMAL" }]
            }
          ],
          pendingMedicalTestIds: [],
          rejectedSamples: [
            {
              sampleId: serumSample.id,
              rejectionCode: "INSUFFICIENT_VOLUME",
              rejectionReason: "Niewystarczająca objętość próbki"
            }
          ]
        });
        expect(consistent.statusCode).toBe(204);

        const samples = await prisma.sample.findMany({ where: { orderId: order.id } });
        const byMaterial = new Map(
          samples.map((sample) => [sample.materialType, sample.status])
        );
        expect(byMaterial.get("SERUM")).toBe("REJECTED");
        expect(byMaterial.get("EDTA_BLOOD")).toBe("ACCEPTED");

        const orderTests = await prisma.orderTest.findMany({ where: { orderId: order.id } });
        const byTestId = new Map(orderTests.map((test) => [test.medicalTestId, test.status]));
        expect(byTestId.get(tests.MORF.id)).toBe("COMPLETED");
        expect(byTestId.get(tests.CRP.id)).toBe("REJECTED");
      }, 15000);
    });

    describe("walidacja kontraktu callbacka REJECTED", () => {
      async function prepareSentOrder(barcodePrefix: string) {
        const { token, patientId, tests } = await setupDefaultOrderData();
        const order = await createOrderAndParse(token, {
          patientId,
          priority: "ROUTINE",
          tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
        });
        await registerSample(token, order.id, {
          materialType: "EDTA_BLOOD",
          barcode: `${barcodePrefix}-A`,
          collectedAt: nowIso()
        });
        await registerSample(token, order.id, {
          materialType: "SERUM",
          barcode: `${barcodePrefix}-B`,
          collectedAt: nowIso()
        });
        const sendResponse = await sendOrder(token, order.id);
        const externalOrderId = JSON.parse(sendResponse.body).externalOrderId as string;
        await prisma.labJob.deleteMany({ where: { orderId: order.id } });
        const samples = await prisma.sample.findMany({ where: { orderId: order.id } });

        return { token, order, externalOrderId, samples, tests };
      }

      async function expectUnchangedOrder(orderId: string) {
        const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
        expect(order.status).toBe("SENT_TO_LAB");
        const samples = await prisma.sample.findMany({ where: { orderId } });
        expect(samples.every((sample) => sample.status !== "REJECTED")).toBe(true);
        expect(samples.every((sample) => sample.rejectionCode === null)).toBe(true);
        expect(await prisma.result.count({ where: { orderId } })).toBe(0);
        expect(
          await prisma.orderHistory.count({
            where: { orderId, eventType: "LAB_SAMPLE_REJECTED" }
          })
        ).toBe(0);
      }

      it("odrzuca callback REJECTED bez pola rejectedSamples", async () => {
        const { order, externalOrderId } = await prepareSentOrder("SMP-VAL-01");

        const response = await webhook({
          externalOrderId,
          eventId: "evt-val-missing",
          status: "REJECTED",
          results: [],
          pendingMedicalTestIds: []
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe("VALIDATION_ERROR");
        expect(body.error.correlationId).toBeTruthy();
        await expectUnchangedOrder(order.id);
      });

      it("odrzuca callback REJECTED z pustą listą rejectedSamples", async () => {
        const { order, externalOrderId } = await prepareSentOrder("SMP-VAL-02");

        const response = await webhook({
          externalOrderId,
          eventId: "evt-val-empty",
          status: "REJECTED",
          results: [],
          pendingMedicalTestIds: [],
          rejectedSamples: []
        });

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body).error.correlationId).toBeTruthy();
        await expectUnchangedOrder(order.id);
      });

      it("odrzuca zduplikowany sampleId na liście", async () => {
        const { order, externalOrderId, samples } = await prepareSentOrder("SMP-VAL-03");
        const rejection = {
          sampleId: samples[0].id,
          rejectionCode: "HEMOLYZED",
          rejectionReason: "Próbka zhemolizowana"
        };

        const response = await webhook({
          externalOrderId,
          eventId: "evt-val-duplicate",
          status: "REJECTED",
          results: [],
          pendingMedicalTestIds: [],
          rejectedSamples: [rejection, { ...rejection }]
        });

        expect(response.statusCode).toBe(400);
        await expectUnchangedOrder(order.id);
      });

      it("odrzuca nieznaną próbkę", async () => {
        const { order, externalOrderId } = await prepareSentOrder("SMP-VAL-04");

        const response = await webhook({
          externalOrderId,
          eventId: "evt-val-unknown",
          status: "REJECTED",
          results: [],
          pendingMedicalTestIds: [],
          rejectedSamples: [
            {
              sampleId: "sample-ktora-nie-istnieje",
              rejectionCode: "HEMOLYZED",
              rejectionReason: "Próbka zhemolizowana"
            }
          ]
        });

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body).error.code).toBe("LAB_CALLBACK_VALIDATION_ERROR");
        await expectUnchangedOrder(order.id);
      });

      it("nie modyfikuje próbki należącej do innego zlecenia", async () => {
        const first = await prepareSentOrder("SMP-VAL-05");
        const second = await prepareSentOrder("SMP-VAL-06");
        const foreignSample = second.samples[0];

        const response = await webhook({
          externalOrderId: first.externalOrderId,
          eventId: "evt-val-foreign",
          status: "REJECTED",
          results: [],
          pendingMedicalTestIds: [],
          rejectedSamples: [
            {
              sampleId: foreignSample.id,
              rejectionCode: "HEMOLYZED",
              rejectionReason: "Próbka zhemolizowana"
            }
          ]
        });

        expect(response.statusCode).toBe(400);
        await expectUnchangedOrder(first.order.id);

        const untouched = await prisma.sample.findUniqueOrThrow({
          where: { id: foreignSample.id }
        });
        expect(untouched.status).toBe(foreignSample.status);
        expect(untouched.rejectionCode).toBeNull();
        expect(untouched.rejectionReason).toBeNull();
      });

      it("odrzuca pusty kod i pusty opis przyczyny", async () => {
        const { order, externalOrderId, samples } = await prepareSentOrder("SMP-VAL-07");

        const emptyCode = await webhook({
          externalOrderId,
          eventId: "evt-val-empty-code",
          status: "REJECTED",
          results: [],
          pendingMedicalTestIds: [],
          rejectedSamples: [
            {
              sampleId: samples[0].id,
              rejectionCode: "",
              rejectionReason: "Próbka zhemolizowana"
            }
          ]
        });
        expect(emptyCode.statusCode).toBe(400);

        const emptyReason = await webhook({
          externalOrderId,
          eventId: "evt-val-empty-reason",
          status: "REJECTED",
          results: [],
          pendingMedicalTestIds: [],
          rejectedSamples: [
            {
              sampleId: samples[0].id,
              rejectionCode: "HEMOLYZED",
              rejectionReason: ""
            }
          ]
        });
        expect(emptyReason.statusCode).toBe(400);

        await expectUnchangedOrder(order.id);
      });

      it("odrzuca zbyt długi kod przyczyny", async () => {
        const { order, externalOrderId, samples } = await prepareSentOrder("SMP-VAL-08");

        const response = await webhook({
          externalOrderId,
          eventId: "evt-val-too-long",
          status: "REJECTED",
          results: [],
          pendingMedicalTestIds: [],
          rejectedSamples: [
            {
              sampleId: samples[0].id,
              rejectionCode: "X".repeat(200),
              rejectionReason: "Próbka zhemolizowana"
            }
          ]
        });

        expect(response.statusCode).toBe(400);
        await expectUnchangedOrder(order.id);
      });

      it("odrzuca listę rejectedSamples przy statusie COMPLETED i PARTIAL", async () => {
        const { order, externalOrderId, samples, tests } = await prepareSentOrder("SMP-VAL-09");
        const rejectedSamples = [
          {
            sampleId: samples[0].id,
            rejectionCode: "HEMOLYZED",
            rejectionReason: "Próbka zhemolizowana"
          }
        ];

        const completed = await webhook({
          externalOrderId,
          eventId: "evt-val-completed",
          status: "COMPLETED",
          results: [],
          pendingMedicalTestIds: [],
          rejectedSamples
        });
        expect(completed.statusCode).toBe(400);

        const partial = await webhook({
          externalOrderId,
          eventId: "evt-val-partial",
          status: "PARTIAL",
          results: [],
          pendingMedicalTestIds: [tests.MORF.id],
          rejectedSamples
        });
        expect(partial.statusCode).toBe(400);

        await expectUnchangedOrder(order.id);
      });

      it("odrzuca callback REJECTED z niepustą listą pendingMedicalTestIds", async () => {
        const { order, externalOrderId, samples, tests } = await prepareSentOrder("SMP-VAL-10");

        const response = await webhook({
          externalOrderId,
          eventId: "evt-val-pending",
          status: "REJECTED",
          results: [],
          pendingMedicalTestIds: [tests.MORF.id],
          rejectedSamples: [
            {
              sampleId: samples[0].id,
              rejectionCode: "HEMOLYZED",
              rejectionReason: "Próbka zhemolizowana"
            }
          ]
        });

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body).error.code).toBe("LAB_CALLBACK_VALIDATION_ERROR");
        await expectUnchangedOrder(order.id);
      });

      it("nie zmienia zlecenia w statusie terminalnym COMPLETED", async () => {
        const { token, patientId, tests } = await setupDefaultOrderData();
        const order = await createOrderAndParse(token, {
          patientId,
          priority: "ROUTINE",
          tests: [{ medicalTestId: tests.CRP.id }]
        });
        await registerSample(token, order.id, {
          materialType: "SERUM",
          barcode: "SMP-VAL-11",
          collectedAt: nowIso()
        });
        const sendResponse = await sendOrder(token, order.id);
        const externalOrderId = JSON.parse(sendResponse.body).externalOrderId as string;

        const completedOrder = await waitForOrderStatus(order.id, "COMPLETED", 8000);
        expect(completedOrder.status).toBe("COMPLETED");
        const sample = await prisma.sample.findFirstOrThrow({
          where: { orderId: order.id }
        });

        const response = await webhook({
          externalOrderId,
          eventId: "evt-val-terminal",
          status: "REJECTED",
          results: [],
          pendingMedicalTestIds: [],
          rejectedSamples: [
            {
              sampleId: sample.id,
              rejectionCode: "INSUFFICIENT_VOLUME",
              rejectionReason: "Niewystarczająca objętość próbki"
            }
          ]
        });

        expect(response.statusCode).toBe(409);
        expect(JSON.parse(response.body).error.code).toBe("ORDER_NOT_ACCEPTING_RESULTS");

        const unchanged = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
        expect(unchanged.status).toBe("COMPLETED");
        const unchangedSample = await prisma.sample.findUniqueOrThrow({
          where: { id: sample.id }
        });
        expect(unchangedSample.status).toBe("ACCEPTED");
        expect(unchangedSample.rejectionCode).toBeNull();
      }, 15000);
    });

    it("wycofuje całą transakcję, gdy zapis historii odrzucenia się nie powiedzie", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, order.id, {
        materialType: "EDTA_BLOOD",
        barcode: "SMP-REJ-0008",
        collectedAt: nowIso()
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-REJ-0009",
        collectedAt: nowIso()
      });

      await setWorkshopConfig(app, { labScenario: "SAMPLE_REJECTED" });
      const sendResponse = await sendOrder(token, order.id);
      expect(sendResponse.statusCode).toBe(200);
      const job = await prisma.labJob.findFirstOrThrow({ where: { orderId: order.id } });
      const payload = job.payload as unknown as Record<string, unknown>;
      await prisma.labJob.deleteMany({ where: { orderId: order.id } });

      const orderHistory = app.get(OrderHistoryService);
      const recordSpy = jest
        .spyOn(orderHistory, "record")
        .mockRejectedValueOnce(new Error("Symulowany błąd zapisu historii."));

      try {
        const response = await webhook(payload);
        expect(response.statusCode).toBe(500);
      } finally {
        recordSpy.mockRestore();
      }

      // Pełny rollback: żaden krok transakcji nie może zostać utrwalony.
      const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(persisted.status).toBe("SENT_TO_LAB");
      const samples = await prisma.sample.findMany({ where: { orderId: order.id } });
      expect(samples.every((sample) => sample.status !== "REJECTED")).toBe(true);
      expect(samples.every((sample) => sample.rejectionCode === null)).toBe(true);
      const orderTests = await prisma.orderTest.findMany({ where: { orderId: order.id } });
      expect(orderTests.every((orderTest) => orderTest.status === "PENDING")).toBe(true);
      expect(await prisma.result.count({ where: { orderId: order.id } })).toBe(0);
      expect(await prisma.processedLabEvent.count({ where: { orderId: order.id } })).toBe(0);
      expect(
        await prisma.orderHistory.count({
          where: { orderId: order.id, eventType: "LAB_SAMPLE_REJECTED" }
        })
      ).toBe(0);

      // Po ustaniu błędu ten sam callback musi dać się przetworzyć w całości.
      const retry = await webhook(payload);
      expect(retry.statusCode).toBe(204);
      const afterRetry = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(afterRetry.status).toBe("REJECTED");
    }, 20000);

    it("nie zmienia zachowania scenariuszy SUCCESS i PARTIAL_SUCCESS", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      await setWorkshopConfig(app, { labScenario: "SUCCESS" });
      const successOrder = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, successOrder.id, {
        materialType: "EDTA_BLOOD",
        barcode: "SMP-REG-0001",
        collectedAt: nowIso()
      });
      await registerSample(token, successOrder.id, {
        materialType: "SERUM",
        barcode: "SMP-REG-0002",
        collectedAt: nowIso()
      });
      expect((await sendOrder(token, successOrder.id)).statusCode).toBe(200);
      const successJobs = await prisma.labJob.findMany({
        where: { orderId: successOrder.id }
      });
      expect(successJobs).toHaveLength(1);
      expect(successJobs[0].scenario).toBe("SUCCESS");
      await waitForOrderStatus(successOrder.id, "COMPLETED", 8000);
      const successTests = await prisma.orderTest.findMany({
        where: { orderId: successOrder.id }
      });
      expect(successTests.every((test) => test.status === "COMPLETED")).toBe(true);
      expect(
        await prisma.orderHistory.count({
          where: { orderId: successOrder.id, eventType: "LAB_SAMPLE_REJECTED" }
        })
      ).toBe(0);

      await setWorkshopConfig(app, { labScenario: "PARTIAL_SUCCESS" });
      const partialOrder = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, partialOrder.id, {
        materialType: "EDTA_BLOOD",
        barcode: "SMP-REG-0003",
        collectedAt: nowIso()
      });
      await registerSample(token, partialOrder.id, {
        materialType: "SERUM",
        barcode: "SMP-REG-0004",
        collectedAt: nowIso()
      });
      expect((await sendOrder(token, partialOrder.id)).statusCode).toBe(200);
      const partialJobs = await prisma.labJob.findMany({
        where: { orderId: partialOrder.id }
      });
      expect(partialJobs).toHaveLength(2);
      await waitForOrderStatus(partialOrder.id, "COMPLETED", 8000);
      const partialSamples = await prisma.sample.findMany({
        where: { orderId: partialOrder.id }
      });
      expect(partialSamples.every((sample) => sample.status === "ACCEPTED")).toBe(true);
    }, 25000);

    it("nadal przyjmuje callbacki bez pola rejectedSamples", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-REG-0005",
        collectedAt: nowIso()
      });
      const sendResponse = await sendOrder(token, order.id);
      const externalOrderId = JSON.parse(sendResponse.body).externalOrderId as string;
      await prisma.labJob.deleteMany({ where: { orderId: order.id } });

      const response = await webhook({
        externalOrderId,
        eventId: "evt-legacy-shape",
        status: "COMPLETED",
        results: [
          {
            medicalTestId: tests.CRP.id,
            parameters: [{ code: "CRP", value: "2.20", unit: "mg/L", flag: "NORMAL" }]
          }
        ],
        pendingMedicalTestIds: []
      });

      expect(response.statusCode).toBe(204);
      const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(persisted.status).toBe("COMPLETED");
    }, 15000);

    it("izoluje zadania i skutki scenariusza SAMPLE_REJECTED między workspace'ami", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, order.id, {
        materialType: "EDTA_BLOOD",
        barcode: "SMP-REJ-0010",
        collectedAt: nowIso()
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-REJ-0011",
        collectedAt: nowIso()
      });

      await setWorkshopConfig(app, { labScenario: "SAMPLE_REJECTED" });
      expect((await sendOrder(token, order.id)).statusCode).toBe(200);

      const otherWorkspace = await prisma.workspace.create({
        data: { slug: "obca-klinika-rejected", name: "Obca Klinika Rejected" }
      });

      await waitForOrderStatus(order.id, "REJECTED", 8000);

      expect(
        await prisma.labJob.count({ where: { workspaceId: otherWorkspace.id } })
      ).toBe(0);
      expect(
        await prisma.result.count({ where: { workspaceId: otherWorkspace.id } })
      ).toBe(0);
      expect(
        await prisma.orderHistory.count({ where: { workspaceId: otherWorkspace.id } })
      ).toBe(0);
      expect(
        await prisma.sample.count({ where: { workspaceId: otherWorkspace.id } })
      ).toBe(0);
    }, 15000);
  });

  describe("publiczna historia zlecenia nie ujawnia scenariusza symulatora", () => {
    /**
     * Nazwy scenariuszy nie mogą wyciekać przez pole `details` publicznej
     * historii. Test celowo pomija samo `details.eventType`: wartość
     * `LAB_SAMPLE_REJECTED` legalnie zawiera podciąg `SAMPLE_REJECTED` jako
     * nazwa typu zdarzenia, a nie jako tryb symulatora.
     */
    function expectNoScenarioLeak(body: {
      items: Array<{ eventType: string; details: Record<string, unknown> }>;
    }) {
      expect(body.items.length).toBeGreaterThan(0);
      for (const item of body.items) {
        expect(Object.keys(item.details)).not.toContain("scenario");

        const detailsWithoutEventType = Object.fromEntries(
          Object.entries(item.details).filter(([key]) => key !== "eventType")
        );
        const serialized = JSON.stringify(detailsWithoutEventType);
        expect(serialized).not.toContain("scenario");
        expect(serialized).not.toContain("SUCCESS");
        expect(serialized).not.toContain("PARTIAL_SUCCESS");
        expect(serialized).not.toContain("SAMPLE_REJECTED");
      }
    }

    async function runScenarioAndReadHistory(
      scenario: "SUCCESS" | "PARTIAL_SUCCESS" | "SAMPLE_REJECTED",
      barcodePrefix: string
    ) {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, order.id, {
        materialType: "EDTA_BLOOD",
        barcode: `${barcodePrefix}-A`,
        collectedAt: nowIso()
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: `${barcodePrefix}-B`,
        collectedAt: nowIso()
      });

      await setWorkshopConfig(app, { labScenario: scenario });
      expect((await sendOrder(token, order.id)).statusCode).toBe(200);
      await waitForOrderStatus(
        order.id,
        scenario === "SAMPLE_REJECTED" ? "REJECTED" : "COMPLETED",
        8000
      );

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${order.id}/history?pageSize=100`,
        headers: { authorization: `Bearer ${token}` }
      });
      expect(response.statusCode).toBe(200);
      return { orderId: order.id, token, body: JSON.parse(response.body) };
    }

    it.each(["SUCCESS", "PARTIAL_SUCCESS", "SAMPLE_REJECTED"] as const)(
      "nie zwraca nazwy scenariusza %s w historii zlecenia",
      async (scenario) => {
        const { body } = await runScenarioAndReadHistory(
          scenario,
          `SMP-LEAK-${scenario.slice(0, 3)}`
        );

        const accepted = body.items.filter(
          (item: { eventType: string }) => item.eventType === "LAB_ORDER_ACCEPTED"
        );
        expect(accepted).toHaveLength(1);
        expect(Object.keys(accepted[0].details).sort()).toEqual([
          "estimatedCompletionAt",
          "eventType",
          "externalOrderId"
        ]);

        expectNoScenarioLeak(body);
      },
      25000
    );

    it("usuwa scenario z wpisu historii zapisanego wcześniej w bazie", async () => {
      // Wpisy `order_history` zapisane starszą wersją kodu mają w kolumnie JSON
      // pole `scenario`. Mapper whitelistuje pola, więc taki wiersz też nie może
      // ujawnić trybu symulatora.
      const { orderId, token, body } = await runScenarioAndReadHistory(
        "SUCCESS",
        "SMP-LEAK-OLD"
      );
      expect(body.items.length).toBeGreaterThan(0);

      const acceptedRow = await prisma.orderHistory.findFirstOrThrow({
        where: { orderId, eventType: "LAB_ORDER_ACCEPTED" }
      });
      await prisma.orderHistory.update({
        where: { id: acceptedRow.id },
        data: {
          details: {
            ...(acceptedRow.details as Record<string, unknown>),
            scenario: "SAMPLE_REJECTED"
          }
        }
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${orderId}/history?pageSize=100`,
        headers: { authorization: `Bearer ${token}` }
      });
      expect(response.statusCode).toBe(200);
      const refreshed = JSON.parse(response.body);
      expectNoScenarioLeak(refreshed);
    }, 25000);
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
