import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { OrderHistoryService } from "../src/order-history/order-history.service";
import { seedDatabase } from "../src/common/prisma/seed-database";
import { closeTestApp, createTestApp } from "./test-app";
import {
  configureTestEnvironment,
  createStaffUser,
  resetTestDatabase,
  setWorkshopConfig
} from "./database";

/**
 * Scenariusz symulatora VALIDATION_ERROR: synchroniczne odrzucenie zlecenia przez
 * laboratorium przy `POST /api/v1/orders/{orderId}/send`.
 *
 * Scenariusz jest sterowany globalnie przez `WorkshopConfigService` (jeden
 * wiersz `workshop_config` + cache w pamięci procesu). Testy przełączają go
 * jawnie przez `setWorkshopConfig()`, które atomowo aktualizuje bazę i cache —
 * bezpośrednie przypisanie do `process.env.LAB_SIMULATOR_SCENARIO` po
 * pierwszym odczycie konfiguracji w tym pliku byłoby cicho ignorowane.
 */
describe("orders send api — scenariusz VALIDATION_ERROR", () => {
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
    await setWorkshopConfig(app, { labScenario: "VALIDATION_ERROR" });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it("zwraca 422 z kontraktowym kodem, komunikatem i błędami pól", async () => {
    const { token, orderId } = await createSendableOrder("SMP-VE-0001");
    const correlationId = "3f1d2a44-0b6e-4f5a-9c21-77b6f0e1a3c9";

    const response = await sendOrder(token, orderId, { correlationId });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe("LAB_ORDER_VALIDATION_ERROR");
    expect(body.error.message).toBe(
      "Laboratorium odrzuciło zlecenie z powodu błędów walidacji."
    );
    expect(body.error.fieldErrors).toEqual([
      {
        field: "tests",
        code: "LAB_TEST_NOT_SUPPORTED",
        message: "Laboratorium nie obsługuje jednego z wybranych badań."
      }
    ]);
  });

  it("zwraca ten sam correlationId w treści błędu i w nagłówku odpowiedzi", async () => {
    const { token, orderId } = await createSendableOrder("SMP-VE-0002");
    const correlationId = "9c2b7d10-51a4-4c8e-a2ef-6a1d0f38b7c5";

    const response = await sendOrder(token, orderId, { correlationId });

    const body = JSON.parse(response.body);
    expect(body.error.correlationId).toBe(correlationId);
    expect(response.headers["x-correlation-id"]).toBe(correlationId);
  });

  it("nie ujawnia danych pacjenta, kodów kreskowych ani nazwy scenariusza", async () => {
    const { token, orderId, patient } = await createSendableOrder("SMP-VE-0003");

    const response = await sendOrder(token, orderId);

    // Kod błędu LAB_ORDER_VALIDATION_ERROR jest kontraktowy; zabroniona jest
    // sama nazwa aktywnego trybu symulatora jako wartość JSON.
    expect(response.body).not.toContain(':"VALIDATION_ERROR"');
    expect(response.body).not.toContain("scenario");
    expect(response.body).not.toContain("SMP-VE-0003");
    expect(response.body).not.toContain(patient.lastName);
    expect(response.body).not.toContain(patient.firstName);
    if (patient.pesel) {
      expect(response.body).not.toContain(patient.pesel);
    }
  });

  it("pozostawia zlecenie w SAMPLE_COLLECTED z pustymi polami integracji", async () => {
    const { token, orderId } = await createSendableOrder("SMP-VE-0004");

    expect((await sendOrder(token, orderId)).statusCode).toBe(422);

    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(persisted.status).toBe("SAMPLE_COLLECTED");
    expect(persisted.externalOrderId).toBeNull();
    expect(persisted.sentAt).toBeNull();
    expect(persisted.estimatedCompletionAt).toBeNull();
  });

  it("nie tworzy klucza idempotencji, zadania lab_jobs ani wyników", async () => {
    const { token, orderId } = await createSendableOrder("SMP-VE-0005");

    expect((await sendOrder(token, orderId)).statusCode).toBe(422);

    expect(await prisma.idempotencyKey.count({ where: { orderId } })).toBe(0);
    expect(await prisma.labJob.count({ where: { orderId } })).toBe(0);
    expect(await prisma.result.count({ where: { orderId } })).toBe(0);
    expect(await prisma.processedLabEvent.count()).toBe(0);
  });

  it("nie zmienia statusów próbek ani badań zlecenia", async () => {
    const { token, orderId } = await createSendableOrder("SMP-VE-0006");
    const testsBefore = await readOrderTestStatuses(orderId);
    const samplesBefore = await readSampleStatuses(orderId);

    expect((await sendOrder(token, orderId)).statusCode).toBe(422);

    expect(await readOrderTestStatuses(orderId)).toEqual(testsBefore);
    expect(await readSampleStatuses(orderId)).toEqual(samplesBefore);
  });

  it("nie zapisuje zdarzeń ORDER_SENT_TO_LAB ani LAB_ORDER_ACCEPTED", async () => {
    const { token, orderId } = await createSendableOrder("SMP-VE-0007");

    expect((await sendOrder(token, orderId)).statusCode).toBe(422);

    const eventTypes = (
      await prisma.orderHistory.findMany({ where: { orderId }, select: { eventType: true } })
    ).map((entry) => entry.eventType);
    expect(eventTypes).not.toContain("ORDER_SENT_TO_LAB");
    expect(eventTypes).not.toContain("LAB_ORDER_ACCEPTED");
    expect(eventTypes).not.toContain("TECHNICAL_ERROR");
  });

  it("zapisuje bezpieczny wpis historii LAB_ORDER_REJECTED mimo odpowiedzi 422", async () => {
    const { token, orderId } = await createSendableOrder("SMP-VE-0008");
    const correlationId = "5b7f0c93-2d61-4a08-8f3d-1c9e4b2a6d70";

    expect((await sendOrder(token, orderId, { correlationId })).statusCode).toBe(422);

    const entry = await prisma.orderHistory.findFirstOrThrow({
      where: { orderId, eventType: "LAB_ORDER_REJECTED" }
    });
    expect(entry.actorType).toBe("LAB");
    expect(entry.actorUserId).toBeNull();
    expect(entry.correlationId).toBe(correlationId);
    expect(entry.previousStatus).toBe("SAMPLE_COLLECTED");
    expect(entry.newStatus).toBe("SAMPLE_COLLECTED");
    expect(entry.details).toEqual({
      rejectionType: "VALIDATION",
      errorCode: "LAB_ORDER_VALIDATION_ERROR",
      fieldErrors: [
        {
          field: "tests",
          code: "LAB_TEST_NOT_SUPPORTED",
          message: "Laboratorium nie obsługuje jednego z wybranych badań."
        }
      ],
      previousStatus: "SAMPLE_COLLECTED",
      newStatus: "SAMPLE_COLLECTED"
    });
  });

  it("publiczna historia nie ujawnia scenariusza ani nazwy aktywnego trybu", async () => {
    const { token, orderId } = await createSendableOrder("SMP-VE-0009");
    expect((await sendOrder(token, orderId)).statusCode).toBe(422);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/orders/${orderId}/history`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    const item = JSON.parse(response.body).items.find(
      (entry: { eventType: string }) => entry.eventType === "LAB_ORDER_REJECTED"
    );
    expect(item.details).toEqual({
      eventType: "LAB_ORDER_REJECTED",
      rejectionType: "VALIDATION",
      errorCode: "LAB_ORDER_VALIDATION_ERROR",
      fieldErrors: [
        {
          field: "tests",
          code: "LAB_TEST_NOT_SUPPORTED",
          message: "Laboratorium nie obsługuje jednego z wybranych badań."
        }
      ],
      previousStatus: "SAMPLE_COLLECTED",
      newStatus: "SAMPLE_COLLECTED"
    });
    expect(response.body).not.toContain('"scenario"');
    expect(response.body).not.toContain(':"VALIDATION_ERROR"');
  });

  it("publiczna historia pomija pola spoza whitelisty zapisane w kolumnie JSON", async () => {
    const { token, orderId } = await createSendableOrder("SMP-VE-0010");
    expect((await sendOrder(token, orderId)).statusCode).toBe(422);

    // Symulacja wiersza zapisanego inną wersją kodu: dodatkowe pola w JSON-ie.
    const entry = await prisma.orderHistory.findFirstOrThrow({
      where: { orderId, eventType: "LAB_ORDER_REJECTED" }
    });
    await prisma.orderHistory.update({
      where: { id: entry.id },
      data: {
        details: {
          rejectionType: "VALIDATION",
          errorCode: "LAB_ORDER_VALIDATION_ERROR",
          scenario: "VALIDATION_ERROR",
          patientPesel: "44051401458",
          fieldErrors: [
            {
              field: "tests",
              code: "LAB_TEST_NOT_SUPPORTED",
              message: "Laboratorium nie obsługuje jednego z wybranych badań.",
              barcode: "SMP-VE-0010"
            }
          ],
          previousStatus: "SAMPLE_COLLECTED",
          newStatus: "SAMPLE_COLLECTED"
        }
      }
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/orders/${orderId}/history`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.body).not.toContain("scenario");
    expect(response.body).not.toContain("patientPesel");
    expect(response.body).not.toContain("44051401458");
    expect(response.body).not.toContain("SMP-VE-0010");
  });

  it("powtórzona próba przy aktywnym błędzie znowu zwraca 422 i osobny wpis historii", async () => {
    const { token, orderId } = await createSendableOrder("SMP-VE-0011");

    // Nagłówek X-Correlation-ID jest honorowany tylko dla poprawnego UUID-a.
    const firstCorrelationId = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c81";
    const secondCorrelationId = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c82";
    const first = await sendOrder(token, orderId, { correlationId: firstCorrelationId });
    const second = await sendOrder(token, orderId, { correlationId: secondCorrelationId });

    expect(first.statusCode).toBe(422);
    expect(second.statusCode).toBe(422);
    expect(JSON.parse(second.body).error).toMatchObject({
      code: "LAB_ORDER_VALIDATION_ERROR",
      message: "Laboratorium odrzuciło zlecenie z powodu błędów walidacji."
    });

    const entries = await prisma.orderHistory.findMany({
      where: { orderId, eventType: "LAB_ORDER_REJECTED" },
      orderBy: { sequence: "asc" }
    });
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.correlationId)).toEqual([
      firstCorrelationId,
      secondCorrelationId
    ]);
    expect(await prisma.idempotencyKey.count({ where: { orderId } })).toBe(0);
  });

  it("po przełączeniu scenariusza na SUCCESS ta sama wysyłka przechodzi normalnie", async () => {
    const { token, orderId } = await createSendableOrder("SMP-VE-0012");

    expect((await sendOrder(token, orderId)).statusCode).toBe(422);

    await setWorkshopConfig(app, { labScenario: "SUCCESS" });
    const response = await sendOrder(token, orderId);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("SENT_TO_LAB");
    expect(body.externalOrderId).toEqual(expect.stringMatching(/^EXT-/));
    expect(await prisma.idempotencyKey.count({ where: { orderId } })).toBe(1);
    expect(await prisma.labJob.count({ where: { orderId } })).toBe(1);

    const eventTypes = (
      await prisma.orderHistory.findMany({ where: { orderId }, select: { eventType: true } })
    ).map((entry) => entry.eventType);
    expect(eventTypes).toContain("LAB_ORDER_REJECTED");
    expect(eventTypes).toContain("ORDER_SENT_TO_LAB");
    expect(eventTypes).toContain("LAB_ORDER_ACCEPTED");
  });

  it("dwie równoległe próby nie tworzą przyjętej wysyłki, zadania ani zmiany statusu", async () => {
    const { token, orderId } = await createSendableOrder("SMP-VE-0013");

    const [first, second] = await Promise.all([
      sendOrder(token, orderId, {
        correlationId: "2b3c4d5e-6f7a-4b1c-9d2e-3f4a5b6c7d81"
      }),
      sendOrder(token, orderId, {
        correlationId: "2b3c4d5e-6f7a-4b1c-9d2e-3f4a5b6c7d82"
      })
    ]);

    expect(first.statusCode).toBe(422);
    expect(second.statusCode).toBe(422);

    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(persisted.status).toBe("SAMPLE_COLLECTED");
    expect(persisted.externalOrderId).toBeNull();
    expect(await prisma.idempotencyKey.count({ where: { orderId } })).toBe(0);
    expect(await prisma.labJob.count({ where: { orderId } })).toBe(0);
    expect(
      await prisma.orderHistory.count({
        where: { orderId, eventType: "ORDER_SENT_TO_LAB" }
      })
    ).toBe(0);
  });

  it("zwraca 500 bez śladu przyjętej wysyłki, gdy zapis historii się nie powiedzie", async () => {
    const { token, orderId } = await createSendableOrder("SMP-VE-0014");
    jest
      .spyOn(app.get(OrderHistoryService), "record")
      .mockRejectedValue(new Error("Awaria zapisu historii."));

    const response = await sendOrder(token, orderId);

    // Nie udajemy poprawnego 422 bez śladu operacji.
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error.code).toBe("INTERNAL_SERVER_ERROR");

    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(persisted.status).toBe("SAMPLE_COLLECTED");
    expect(persisted.externalOrderId).toBeNull();
    expect(await prisma.orderHistory.count({ where: { orderId, eventType: "LAB_ORDER_REJECTED" } })).toBe(0);
    expect(await prisma.idempotencyKey.count({ where: { orderId } })).toBe(0);
    expect(await prisma.labJob.count({ where: { orderId } })).toBe(0);
  });

  it("respektuje izolację workspace'u i nie zapisuje historii dla obcego zlecenia", async () => {
    const { orderId } = await createSendableOrder("SMP-VE-0015");
    const { user } = await createStaffUser(prisma, {
      workspaceSlug: "obca-klinika-validation",
      workspaceName: "Obca Klinika Walidacja",
      login: "staff.obcy.validation",
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
    expect(JSON.parse(response.body).error.code).toBe("ORDER_NOT_FOUND");
    expect(
      await prisma.orderHistory.count({ where: { orderId, eventType: "LAB_ORDER_REJECTED" } })
    ).toBe(0);
  });

  it("lokalna walidacja wysyłki ma pierwszeństwo przed odrzuceniem laboratorium", async () => {
    const { token, orderId } = await createSendableOrder("SMP-VE-0016");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    await prisma.patient.update({ where: { id: order.patientId }, data: { active: false } });

    const response = await sendOrder(token, orderId);

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.code).toBe("ORDER_SEND_ERROR");
    expect(
      await prisma.orderHistory.count({ where: { orderId, eventType: "LAB_ORDER_REJECTED" } })
    ).toBe(0);
  });

  it("dokumentuje w OpenAPI odrzucenie walidacyjne laboratorium", async () => {
    const response = await app.inject({ method: "GET", url: "/api/docs-json" });
    const document = JSON.parse(response.body);
    const send = document.paths["/api/v1/orders/{orderId}/send"].post;

    expect(send.responses["422"]).toBeDefined();
    expect(JSON.stringify(send.responses["422"])).toContain("LAB_ORDER_VALIDATION_ERROR");
    expect(JSON.stringify(send.responses["422"])).toContain("fieldErrors");
    expect(JSON.stringify(send.responses["422"])).toContain("correlationId");

    const historyDetails =
      document.components.schemas.OrderHistoryItemDto.properties.eventType;
    expect(historyDetails.enum).toContain("LAB_ORDER_REJECTED");
    // Publiczne OpenAPI nie dokumentuje pola `scenario`.
    expect(JSON.stringify(document.components.schemas.OrderHistoryItemDto)).not.toContain(
      '"scenario"'
    );
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

  /**
   * Tworzy zlecenie gotowe do wysyłki: status SAMPLE_COLLECTED, jedna próbka.
   * Korzysta z pacjenta z seeda, żeby nie duplikować numeru PESEL w workspace.
   */
  async function createSendableOrder(barcode: string) {
    const token = await login();
    const user = await prisma.user.findUniqueOrThrow({ where: { login: "staff.demo" } });
    const patient = await prisma.patient.findFirstOrThrow({
      where: { workspaceId: user.workspaceId, active: true }
    });
    const medicalTest = await prisma.medicalTest.findFirstOrThrow({
      where: { code: "CRP" }
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        patientId: patient.id,
        priority: "ROUTINE",
        tests: [{ medicalTestId: medicalTest.id }]
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const orderId = JSON.parse(createResponse.body).id as string;

    const sampleResponse = await app.inject({
      method: "POST",
      url: `/api/v1/orders/${orderId}/samples`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        materialType: medicalTest.materialType,
        barcode,
        collectedAt: new Date().toISOString()
      }
    });
    expect(sampleResponse.statusCode).toBe(200);
    expect(JSON.parse(sampleResponse.body).status).toBe("SAMPLE_COLLECTED");

    return { token, orderId, patient };
  }

  async function readOrderTestStatuses(orderId: string) {
    return prisma.orderTest.findMany({
      where: { orderId },
      select: { id: true, status: true },
      orderBy: { id: "asc" }
    });
  }

  async function readSampleStatuses(orderId: string) {
    return prisma.sample.findMany({
      where: { orderId },
      select: { id: true, status: true, rejectionCode: true, rejectionReason: true },
      orderBy: { id: "asc" }
    });
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
