import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { LabSendRetryScheduler } from "../src/lab-send-retry/lab-send-retry.scheduler";
import { LabSendRetryService } from "../src/lab-send-retry/lab-send-retry.service";
import { OrdersService } from "../src/orders/orders.service";
import { LabCallbacksService } from "../src/lab-callbacks/lab-callbacks.service";
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
 * Scenariusz symulatora RATE_LIMIT: laboratorium chwilowo ogranicza liczbę żądań.
 *
 * Przepływ: pierwsza próba `POST /api/v1/orders/{orderId}/send` → HTTP 429 →
 * trwałe zadanie ponowienia → automatyczne ponowienie po 15 s → przyjęcie
 * zlecenia → callback z wynikami jak w SUCCESS.
 *
 * Testy NIE czekają realnych 15 sekund. Zamiast tego przesuwają `executeAt`
 * zadania w przeszłość i jawnie wywołują metodę przetwarzającą kolejkę, więc
 * poprawność nie zależy od `setTimeout` ani od pętli schedulera.
 */
describe("orders send api — scenariusz RATE_LIMIT", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let labSendRetry: LabSendRetryService;

  beforeAll(async () => {
    configureTestEnvironment();
    process.env.SEED_STAFF_PASSWORD = "SeedTestowe123!";
    app = await createTestApp();
    prisma = app.get(PrismaService);
    labSendRetry = app.get(LabSendRetryService);

    // Kolejka ponowień jest w tym pliku sterowana WYŁĄCZNIE jawnymi wywołaniami
    // `processDueJobs`. Pętla czasowa schedulera tyka w testach co 100 ms
    // (`LAB_SCHEDULER_POLL_INTERVAL_MS`) i konkurowałaby o te same zadania:
    // przejęcie zadania przez przebieg w tle sprawiłoby, że asercje wykonują się
    // w trakcie trwającej jeszcze transakcji wysyłki. Zatrzymujemy pętlę, żeby
    // wynik nie zależał od wyścigu; sama odporność na równoległe przebiegi jest
    // sprawdzana osobnym przypadkiem, który wywołuje je jawnie.
    app.get(LabSendRetryScheduler).onModuleDestroy();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    await seedDatabase(prisma);
    await setWorkshopConfig(app, { labScenario: "RATE_LIMIT" });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  describe("pierwsza odpowiedź 429", () => {
    it("zwraca 429 z kontraktowym kodem, polskim komunikatem i nagłówkiem Retry-After", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0001");

      const response = await sendOrder(token, orderId);

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("LAB_RATE_LIMITED");
      expect(body.error.message).toBe(
        "Laboratorium chwilowo ograniczyło liczbę żądań. Wysyłka zostanie ponowiona automatycznie."
      );
      expect(response.headers["retry-after"]).toBe("15");
    });

    it("zwraca spójny correlationId w nagłówku, treści, historii i zadaniu ponowienia", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0002");
      const correlationId = "7c1e5a92-3f84-4c6b-9a15-2d8e0b7f4a61";

      const response = await sendOrder(token, orderId, { correlationId });

      expect(JSON.parse(response.body).error.correlationId).toBe(correlationId);
      expect(response.headers["x-correlation-id"]).toBe(correlationId);

      const entry = await prisma.orderHistory.findFirstOrThrow({
        where: { orderId, eventType: "LAB_RATE_LIMIT_RECEIVED" }
      });
      expect(entry.correlationId).toBe(correlationId);

      const job = await prisma.labSendRetryJob.findFirstOrThrow({ where: { orderId } });
      expect(job.correlationId).toBe(correlationId);
    });

    it("pozostawia zlecenie w SAMPLE_COLLECTED z pustymi polami integracji", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0003");

      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      const persisted = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(persisted.status).toBe("SAMPLE_COLLECTED");
      expect(persisted.externalOrderId).toBeNull();
      expect(persisted.sentAt).toBeNull();
      expect(persisted.estimatedCompletionAt).toBeNull();
    });

    it("nie zmienia statusów próbek ani badań zlecenia", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0004");
      const testsBefore = await readOrderTestStatuses(orderId);
      const samplesBefore = await readSampleStatuses(orderId);

      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      expect(await readOrderTestStatuses(orderId)).toEqual(testsBefore);
      expect(await readSampleStatuses(orderId)).toEqual(samplesBefore);
    });

    it("tworzy dokładnie jedno zadanie ponowienia z danymi technicznymi bez PII", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0005");

      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      const jobs = await prisma.labSendRetryJob.findMany({ where: { orderId } });
      expect(jobs).toHaveLength(1);
      const [job] = jobs;
      expect(job.status).toBe("PENDING");
      expect(job.attemptNumber).toBe(2);
      expect(job.attempts).toBe(0);
      expect(job.scenario).toBe("RATE_LIMIT");
      expect(job.idempotencyKey).toBe(`send-${orderId}`);

      // Termin ponowienia to 15 sekund od chwili odpowiedzi 429.
      const delayMs = job.executeAt.getTime() - job.createdAt.getTime();
      expect(delayMs).toBeGreaterThanOrEqual(14_000);
      expect(delayMs).toBeLessThanOrEqual(16_000);

      // Zadanie nie przechowuje danych pacjenta ani kodów kreskowych.
      const serialized = JSON.stringify(job);
      expect(serialized).not.toContain("SMP-RL-0005");
      expect(serialized).not.toContain("44051401458");
    });

    it("rezerwuje dokładnie jeden klucz idempotencji w stanie oczekującym", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0006");

      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      const keys = await prisma.idempotencyKey.findMany({ where: { orderId } });
      expect(keys).toHaveLength(1);
      expect(keys[0].key).toBe(`send-${orderId}`);
      // Klucz jest zarezerwowany, ale operacja NIE jest zakończona sukcesem —
      // w odróżnieniu od VALIDATION_ERROR, który klucza w ogóle nie tworzy.
      expect(keys[0].responseStatus).toBe(429);
      expect(keys[0].responseBody).toMatchObject({ state: "PENDING_SEND_RETRY" });
    });

    it("nie tworzy zadania callbacka, wyników ani zdarzeń przyjęcia zlecenia", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0007");

      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      expect(await prisma.labJob.count({ where: { orderId } })).toBe(0);
      expect(await prisma.result.count({ where: { orderId } })).toBe(0);
      expect(await prisma.processedLabEvent.count()).toBe(0);

      const eventTypes = await readEventTypes(orderId);
      expect(eventTypes).not.toContain("ORDER_SENT_TO_LAB");
      expect(eventTypes).not.toContain("LAB_ORDER_ACCEPTED");
      // Ograniczenie przepustowości NIE jest błędem technicznym.
      expect(eventTypes).not.toContain("TECHNICAL_ERROR");
    });

    it("zapisuje bezpieczne zdarzenie historii o otrzymaniu ograniczenia", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0008");

      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      const entry = await prisma.orderHistory.findFirstOrThrow({
        where: { orderId, eventType: "LAB_RATE_LIMIT_RECEIVED" }
      });
      // Odpowiedź 429 pochodzi od laboratorium, a nie od personelu.
      expect(entry.actorType).toBe("LAB");
      expect(entry.actorUserId).toBeNull();
      expect(entry.previousStatus).toBe("SAMPLE_COLLECTED");
      expect(entry.newStatus).toBe("SAMPLE_COLLECTED");
      expect(entry.details).toMatchObject({
        attemptNumber: 1,
        retryAfterSeconds: 15,
        previousStatus: "SAMPLE_COLLECTED",
        newStatus: "SAMPLE_COLLECTED"
      });
      expect(JSON.stringify(entry.details)).not.toContain("RATE_LIMIT");
    });
  });

  describe("powtórzone i równoległe żądania w trakcie oczekiwania", () => {
    it("ręczne powtórzenie zwraca 429 i nie tworzy duplikatów", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0009");

      const first = await sendOrder(token, orderId);
      const second = await sendOrder(token, orderId);

      expect(first.statusCode).toBe(429);
      expect(second.statusCode).toBe(429);
      expect(JSON.parse(second.body).error.code).toBe("LAB_RATE_LIMITED");

      expect(await prisma.labSendRetryJob.count({ where: { orderId } })).toBe(1);
      expect(await prisma.idempotencyKey.count({ where: { orderId } })).toBe(1);
      expect(
        await prisma.orderHistory.count({
          where: { orderId, eventType: "LAB_RATE_LIMIT_RECEIVED" }
        })
      ).toBe(1);
    });

    it("powtórzone żądanie zwraca pozostały czas i nigdy wartości ujemnej", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0010");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      const duringWait = await sendOrder(token, orderId);
      expect(Number(duringWait.headers["retry-after"])).toBeGreaterThanOrEqual(0);
      expect(Number(duringWait.headers["retry-after"])).toBeLessThanOrEqual(15);

      // Termin w przeszłości nie może dać ujemnego Retry-After.
      await makeRetryJobDue(orderId);
      const afterDeadline = await sendOrder(token, orderId);
      expect(afterDeadline.statusCode).toBe(429);
      expect(afterDeadline.headers["retry-after"]).toBe("0");
    });

    it("dwa równoległe pierwsze żądania tworzą łącznie jedno zadanie ponowienia", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0011");

      const [first, second] = await Promise.all([
        sendOrder(token, orderId, {
          correlationId: "4d5e6f70-8a9b-4c1d-8e2f-3a4b5c6d7e81"
        }),
        sendOrder(token, orderId, {
          correlationId: "4d5e6f70-8a9b-4c1d-8e2f-3a4b5c6d7e82"
        })
      ]);

      expect(first.statusCode).toBe(429);
      expect(second.statusCode).toBe(429);
      expect(await prisma.labSendRetryJob.count({ where: { orderId } })).toBe(1);
      expect(await prisma.idempotencyKey.count({ where: { orderId } })).toBe(1);
      expect(
        await prisma.orderHistory.count({
          where: { orderId, eventType: "LAB_RATE_LIMIT_RECEIVED" }
        })
      ).toBe(1);
      expect(await prisma.labJob.count({ where: { orderId } })).toBe(0);
    });

    it("ten sam klucz z innym hashem requestu nadal zwraca 409", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0012");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      // Zmiana danych zlecenia zmienia hash requestu wysyłki.
      await prisma.sample.updateMany({
        where: { orderId },
        data: { barcode: "SMP-RL-0012-INNY" }
      });

      const response = await sendOrder(token, orderId);

      expect(response.statusCode).toBe(409);
      expect(JSON.parse(response.body).error.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
    });
  });

  describe("scheduler i trwałość kolejki", () => {
    it("nie wykonuje zadania przed zaplanowanym terminem", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0013");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      const processed = await labSendRetry.processDueJobs(new Date());

      expect(processed).toBe(0);
      const persisted = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(persisted.status).toBe("SAMPLE_COLLECTED");
      expect(
        (await prisma.labSendRetryJob.findFirstOrThrow({ where: { orderId } })).status
      ).toBe("PENDING");
    });

    it("wykonuje zadanie po nadejściu terminu i przyjmuje zlecenie", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0014");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      await makeRetryJobDue(orderId);
      const processed = await labSendRetry.processDueJobs(new Date());

      expect(processed).toBe(1);
      const persisted = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(persisted.status).toBe("SENT_TO_LAB");
      expect(persisted.externalOrderId).toEqual(expect.stringMatching(/^EXT-/));
      expect(persisted.sentAt).not.toBeNull();
      expect(persisted.estimatedCompletionAt).not.toBeNull();
    });

    it("tworzy dokładnie jeden externalOrderId i jedno zadanie callbacka", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0015");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      await makeRetryJobDue(orderId);
      await labSendRetry.processDueJobs(new Date());

      const orders = await prisma.order.findMany({
        where: { id: orderId },
        select: { externalOrderId: true }
      });
      expect(orders).toHaveLength(1);
      expect(orders[0].externalOrderId).not.toBeNull();
      expect(await prisma.labJob.count({ where: { orderId } })).toBe(1);
    });

    it("oznacza zadanie ponowienia jako DONE i aktualizuje idempotencję na sukces", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0016");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      await makeRetryJobDue(orderId);
      await labSendRetry.processDueJobs(new Date());

      const job = await prisma.labSendRetryJob.findFirstOrThrow({ where: { orderId } });
      expect(job.status).toBe("DONE");
      expect(job.lockedAt).toBeNull();
      expect(job.lastError).toBeNull();

      const key = await prisma.idempotencyKey.findFirstOrThrow({ where: { orderId } });
      expect(key.responseStatus).toBe(200);
      expect(key.responseBody).toMatchObject({
        externalOrderId: expect.stringMatching(/^EXT-/)
      });
    });

    it("po udanym ponowieniu kolejne wywołanie zwraca wcześniejszy rezultat bez nowych zadań", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0017");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);
      await makeRetryJobDue(orderId);
      await labSendRetry.processDueJobs(new Date());

      const externalOrderId = (
        await prisma.order.findUniqueOrThrow({ where: { id: orderId } })
      ).externalOrderId;

      const response = await sendOrder(token, orderId);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("SENT_TO_LAB");
      expect(body.externalOrderId).toBe(externalOrderId);
      expect(await prisma.labJob.count({ where: { orderId } })).toBe(1);
      expect(await prisma.labSendRetryJob.count({ where: { orderId } })).toBe(1);
    });

    it("zachowuje ten sam correlationId co pierwotna wysyłka", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0018");
      const correlationId = "6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c91";
      expect((await sendOrder(token, orderId, { correlationId })).statusCode).toBe(429);

      await makeRetryJobDue(orderId);
      await labSendRetry.processDueJobs(new Date());

      const persisted = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(persisted.correlationId).toBe(correlationId);

      const entries = await prisma.orderHistory.findMany({
        where: {
          orderId,
          eventType: { in: ["LAB_RATE_LIMIT_RECEIVED", "LAB_SEND_RETRY", "ORDER_SENT_TO_LAB"] }
        }
      });
      expect(entries).toHaveLength(3);
      for (const entry of entries) {
        expect(entry.correlationId).toBe(correlationId);
      }
    });

    it("nie gubi zadania po restarcie aplikacji przed terminem wykonania", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0019");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      // Symulacja restartu: nowa instancja serwisu z nowym połączeniem czyta
      // zadanie wyłącznie z bazy, bez żadnego stanu w pamięci poprzedniego procesu.
      const freshService = new LabSendRetryService(
        app.get(PrismaService),
        app.get(OrdersService)
      );
      await makeRetryJobDue(orderId);

      expect(await freshService.processDueJobs(new Date())).toBe(1);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status
      ).toBe("SENT_TO_LAB");
    });

    it("nie duplikuje wysyłki przy dwóch równoległych przebiegach schedulera", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0020");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);
      await makeRetryJobDue(orderId);

      const now = new Date();
      const results = await Promise.all([
        labSendRetry.processDueJobs(now),
        labSendRetry.processDueJobs(now)
      ]);

      expect(results.reduce((sum, value) => sum + value, 0)).toBe(1);
      expect(await prisma.labJob.count({ where: { orderId } })).toBe(1);
      expect(
        await prisma.orderHistory.count({ where: { orderId, eventType: "ORDER_SENT_TO_LAB" } })
      ).toBe(1);
    });

    it("nie zostawia częściowo przyjętego zlecenia, gdy transakcja ponowienia padnie", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0021");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);
      await makeRetryJobDue(orderId);

      jest
        .spyOn(app.get(OrderHistoryService), "record")
        .mockRejectedValue(new Error("Awaria zapisu historii."));

      await labSendRetry.processDueJobs(new Date());

      const persisted = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(persisted.status).toBe("SAMPLE_COLLECTED");
      expect(persisted.externalOrderId).toBeNull();
      expect(await prisma.labJob.count({ where: { orderId } })).toBe(0);

      const job = await prisma.labSendRetryJob.findFirstOrThrow({ where: { orderId } });
      // Zadanie wraca do kolejki, a klucz idempotencji nadal opisuje oczekiwanie.
      expect(job.status).toBe("PENDING");
      const key = await prisma.idempotencyKey.findFirstOrThrow({ where: { orderId } });
      expect(key.responseStatus).toBe(429);
    });

    it("po błędzie wykonania odsuwa zadanie w przyszłość zamiast wpadać w gorącą pętlę", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0032");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);
      await makeRetryJobDue(orderId);

      const historySpy = jest
        .spyOn(app.get(OrderHistoryService), "record")
        .mockRejectedValue(
          new Error("Awaria zapisu: SELECT * FROM patients WHERE pesel = '44051401458'")
        );

      const failedAt = new Date();
      await labSendRetry.processDueJobs(failedAt);

      const job = await prisma.labSendRetryJob.findFirstOrThrow({ where: { orderId } });
      expect(job.status).toBe("PENDING");
      expect(job.executeAt.getTime()).toBeGreaterThanOrEqual(failedAt.getTime() + 15_000);
      // Numer próby wysyłki opisuje komunikację z laboratorium — błąd techniczny
      // workera go nie zużywa; techniczne uruchomienia liczy `attempts`.
      expect(job.attemptNumber).toBe(2);
      expect(job.attempts).toBe(1);

      // `lastError` nie może zawierać treści wyjątku ani stack trace'a.
      expect(job.lastError).toBe("Techniczny błąd wykonania zadania ponowienia wysyłki.");
      expect(job.lastError).not.toContain("44051401458");
      expect(job.lastError).not.toContain("SELECT");

      // Kolejne, natychmiastowe przebiegi schedulera nie podejmują zadania.
      expect(await labSendRetry.processDueJobs(new Date())).toBe(0);
      expect(
        await labSendRetry.processDueJobs(new Date(failedAt.getTime() + 2_000))
      ).toBe(0);
      expect(
        (await prisma.labSendRetryJob.findFirstOrThrow({ where: { orderId } })).attempts
      ).toBe(1);

      // Po nadejściu nowego terminu zadanie jest znów podejmowalne i kończy się
      // sukcesem — odsunięcie nie oznacza porzucenia wysyłki.
      historySpy.mockRestore();
      await makeRetryJobDue(orderId);
      expect(await labSendRetry.processDueJobs(new Date())).toBe(1);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status
      ).toBe("SENT_TO_LAB");
    });
  });

  /**
   * Automatyczne ponowienie odtwarza dane z bazy, więc musi ponownie sprawdzić
   * warunki wysyłki. Zlecenie, którego nie wolno już wysłać ręcznie, nie może
   * zostać wysłane automatycznie „na podstawie” stanu sprzed 15 sekund.
   */
  describe("weryfikacja aktualności zlecenia przed automatycznym ponowieniem", () => {
    it("nie wysyła zlecenia, gdy pacjent został dezaktywowany po pierwszym 429", async () => {
      const { token, orderId, patient } = await createSendableOrder("SMP-RL-0033");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      await deactivatePatient(patient.id);
      await makeRetryJobDue(orderId);
      await labSendRetry.processDueJobs(new Date());

      const persisted = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(persisted.status).toBe("SAMPLE_COLLECTED");
      expect(persisted.externalOrderId).toBeNull();
      expect(persisted.sentAt).toBeNull();
      expect(persisted.estimatedCompletionAt).toBeNull();

      // Brak jakichkolwiek częściowych skutków wysyłki.
      expect(await prisma.labJob.count({ where: { orderId } })).toBe(0);
      expect(await prisma.result.count({ where: { orderId } })).toBe(0);
      const eventTypes = await readEventTypes(orderId);
      expect(eventTypes).not.toContain("ORDER_SENT_TO_LAB");
      expect(eventTypes).not.toContain("LAB_ORDER_ACCEPTED");
      expect(eventTypes).not.toContain("TECHNICAL_ERROR");
    });

    it("anuluje zadanie terminalnie i nie zostawia go w gorącej pętli", async () => {
      const { token, orderId, patient } = await createSendableOrder("SMP-RL-0034");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      await deactivatePatient(patient.id);
      await makeRetryJobDue(orderId);
      await labSendRetry.processDueJobs(new Date());

      // Zadanie nie wraca do PENDING i nie zostaje jako wiersz terminalny, który
      // przez unikalność (workspaceId, orderId) zablokowałby kolejne ponowienie.
      expect(await prisma.labSendRetryJob.count({ where: { orderId } })).toBe(0);
      expect(await labSendRetry.processDueJobs(new Date())).toBe(0);

      // Rezerwacja idempotencji jest zwolniona, więc wysyłkę można zacząć od zera.
      expect(await prisma.idempotencyKey.count({ where: { orderId } })).toBe(0);
    });

    it("zapisuje bezpieczny wpis historii o anulowaniu ponowienia", async () => {
      const { token, orderId, patient } = await createSendableOrder("SMP-RL-0035");
      const correlationId = "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c60";
      expect((await sendOrder(token, orderId, { correlationId })).statusCode).toBe(429);

      await deactivatePatient(patient.id);
      await makeRetryJobDue(orderId);
      await labSendRetry.processDueJobs(new Date());

      const entry = await prisma.orderHistory.findFirstOrThrow({
        where: { orderId, eventType: "LAB_SEND_RETRY" }
      });
      expect(entry.actorType).toBe("SYSTEM");
      expect(entry.actorUserId).toBeNull();
      expect(entry.correlationId).toBe(correlationId);
      // Anulowanie nie zmienia statusu zlecenia.
      expect(entry.previousStatus).toBe("SAMPLE_COLLECTED");
      expect(entry.newStatus).toBe("SAMPLE_COLLECTED");
      expect(entry.details).toEqual({
        attemptNumber: 2,
        outcome: "CANCELLED",
        reason: "PATIENT_INACTIVE",
        previousStatus: "SAMPLE_COLLECTED",
        newStatus: "SAMPLE_COLLECTED"
      });
    });

    it("publiczna historia anulowania nie ujawnia danych pacjenta ani scenariusza", async () => {
      const { token, orderId, patient } = await createSendableOrder("SMP-RL-0036");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      await deactivatePatient(patient.id);
      await makeRetryJobDue(orderId);
      await labSendRetry.processDueJobs(new Date());

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${orderId}/history`,
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('"scenario"');
      expect(response.body).not.toContain(':"RATE_LIMIT"');
      expect(response.body).not.toContain("SMP-RL-0036");
      expect(response.body).not.toContain(patient.lastName);
      if (patient.pesel) {
        expect(response.body).not.toContain(patient.pesel);
      }

      const items = JSON.parse(response.body).items as Array<{
        eventType: string;
        details: Record<string, unknown>;
      }>;
      const retryItem = items.find((item) => item.eventType === "LAB_SEND_RETRY");
      expect(Object.keys(retryItem!.details).sort()).toEqual([
        "attemptNumber",
        "eventType",
        "newStatus",
        "outcome",
        "previousStatus",
        "reason"
      ]);
    });

    it("po przywróceniu pacjenta można rozpocząć wysyłkę od zera", async () => {
      const { token, orderId, patient } = await createSendableOrder("SMP-RL-0037");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      await deactivatePatient(patient.id);
      await makeRetryJobDue(orderId);
      await labSendRetry.processDueJobs(new Date());

      // Dopóki pacjent jest nieaktywny, ręczna wysyłka jest odrzucana regułą
      // biznesową — a nie 429 ani konfliktem idempotencji.
      const blocked = await sendOrder(token, orderId);
      expect(blocked.statusCode).toBe(422);
      expect(JSON.parse(blocked.body).error.code).toBe("ORDER_SEND_ERROR");

      await prisma.patient.update({ where: { id: patient.id }, data: { active: true } });

      // Pierwsza próba nowej wysyłki znów dostaje 429 i tworzy NOWE zadanie —
      // unikalność (workspaceId, orderId) nie blokuje kolejnego ponowienia.
      const restarted = await sendOrder(token, orderId);
      expect(restarted.statusCode).toBe(429);
      expect(await prisma.labSendRetryJob.count({ where: { orderId } })).toBe(1);

      await makeRetryJobDue(orderId);
      expect(await labSendRetry.processDueJobs(new Date())).toBe(1);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status
      ).toBe("SENT_TO_LAB");
    });

    /**
     * Model produktu nie pozwala personelowi zmienić danych objętych hashem
     * wysyłki dla zlecenia w `SAMPLE_COLLECTED`: edycja zlecenia jest dopuszczona
     * wyłącznie w `DRAFT` (`canEditDraftOrder`), a rejestracja próbki wyłącznie
     * w `DRAFT`/`SAMPLE_COLLECTION_IN_PROGRESS`. Zabezpieczenie chroni więc przed
     * zmianą spoza publicznego API (import danych, operacja serwisowa, wyścig na
     * poziomie bazy), dlatego test wywołuje ją zapisem bezpośrednio w bazie.
     */
    it("anuluje ponowienie, gdy dane objęte hashem zmieniły się po pierwszej próbie", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0038");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      await prisma.sample.updateMany({
        where: { orderId },
        data: { barcode: "SMP-RL-0038-INNY" }
      });
      await makeRetryJobDue(orderId);
      await labSendRetry.processDueJobs(new Date());

      const persisted = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(persisted.status).toBe("SAMPLE_COLLECTED");
      expect(persisted.externalOrderId).toBeNull();
      expect(await prisma.labJob.count({ where: { orderId } })).toBe(0);

      const entry = await prisma.orderHistory.findFirstOrThrow({
        where: { orderId, eventType: "LAB_SEND_RETRY" }
      });
      expect(entry.details).toMatchObject({
        outcome: "CANCELLED",
        reason: "REQUEST_CHANGED"
      });
      expect(JSON.stringify(entry.details)).not.toContain("SMP-RL-0038");

      // Zadanie i rezerwacja idempotencji są zwolnione, więc nowa wysyłka
      // startuje z aktualnym hashem zamiast dostawać 409 na zawsze.
      expect(await prisma.labSendRetryJob.count({ where: { orderId } })).toBe(0);
      expect(await prisma.idempotencyKey.count({ where: { orderId } })).toBe(0);

      const restarted = await sendOrder(token, orderId);
      expect(restarted.statusCode).toBe(429);
    });

    it("nie anuluje ponowienia, gdy warunki wysyłki się nie zmieniły", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0039");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      await makeRetryJobDue(orderId);
      await labSendRetry.processDueJobs(new Date());

      const entry = await prisma.orderHistory.findFirstOrThrow({
        where: { orderId, eventType: "LAB_SEND_RETRY" }
      });
      expect(entry.details).toMatchObject({ outcome: "ACCEPTED" });
    });
  });

  describe("historia, callback i izolacja", () => {
    it("zapisuje automatyczne ponowienie jako działanie systemowe, nie personelu", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0022");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);
      await makeRetryJobDue(orderId);
      await labSendRetry.processDueJobs(new Date());

      const retryEntry = await prisma.orderHistory.findFirstOrThrow({
        where: { orderId, eventType: "LAB_SEND_RETRY" }
      });
      expect(retryEntry.actorType).toBe("SYSTEM");
      expect(retryEntry.actorUserId).toBeNull();
      expect(retryEntry.details).toEqual({
        attemptNumber: 2,
        outcome: "ACCEPTED",
        previousStatus: "SAMPLE_COLLECTED",
        newStatus: "SENT_TO_LAB"
      });

      const sentEntry = await prisma.orderHistory.findFirstOrThrow({
        where: { orderId, eventType: "ORDER_SENT_TO_LAB" }
      });
      // Automatyczna wysyłka nie może udawać nowego kliknięcia personelu.
      expect(sentEntry.actorType).toBe("SYSTEM");
      expect(sentEntry.actorUserId).toBeNull();
    });

    it("historia pokazuje pełną ścieżkę: ograniczenie, ponowienie i przyjęcie", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0023");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);
      await makeRetryJobDue(orderId);
      await labSendRetry.processDueJobs(new Date());

      const eventTypes = await readEventTypes(orderId);
      expect(eventTypes).toContain("LAB_RATE_LIMIT_RECEIVED");
      expect(eventTypes).toContain("LAB_SEND_RETRY");
      expect(eventTypes).toContain("ORDER_SENT_TO_LAB");
      expect(eventTypes).toContain("LAB_ORDER_ACCEPTED");
      expect(eventTypes).not.toContain("TECHNICAL_ERROR");

      // Brak duplikatów wpisów.
      for (const eventType of [
        "LAB_RATE_LIMIT_RECEIVED",
        "LAB_SEND_RETRY",
        "ORDER_SENT_TO_LAB",
        "LAB_ORDER_ACCEPTED"
      ]) {
        expect(eventTypes.filter((value) => value === eventType)).toHaveLength(1);
      }
    });

    it("publiczna historia nie ujawnia nazwy scenariusza ani danych wrażliwych", async () => {
      const { token, orderId, patient } = await createSendableOrder("SMP-RL-0024");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);
      await makeRetryJobDue(orderId);
      await labSendRetry.processDueJobs(new Date());

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${orderId}/history`,
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('"scenario"');
      // `LAB_RATE_LIMIT_RECEIVED` to publiczny typ zdarzenia historii; zabroniona
      // jest sama nazwa aktywnego scenariusza symulatora jako wartość JSON.
      expect(response.body).not.toContain(':"RATE_LIMIT"');
      expect(response.body).not.toContain("SMP-RL-0024");
      expect(response.body).not.toContain(patient.lastName);
      if (patient.pesel) {
        expect(response.body).not.toContain(patient.pesel);
      }

      const items = JSON.parse(response.body).items as Array<{
        eventType: string;
        details: Record<string, unknown>;
      }>;
      const rateLimitItem = items.find(
        (item) => item.eventType === "LAB_RATE_LIMIT_RECEIVED"
      );
      expect(Object.keys(rateLimitItem!.details).sort()).toEqual([
        "attemptNumber",
        "eventType",
        "newStatus",
        "nextRetryAt",
        "previousStatus",
        "retryAfterSeconds"
      ]);
    });

    it("publiczna historia pomija pola spoza whitelisty zapisane w kolumnie JSON", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0025");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);

      const entry = await prisma.orderHistory.findFirstOrThrow({
        where: { orderId, eventType: "LAB_RATE_LIMIT_RECEIVED" }
      });
      await prisma.orderHistory.update({
        where: { id: entry.id },
        data: {
          details: {
            attemptNumber: 1,
            retryAfterSeconds: 15,
            nextRetryAt: new Date().toISOString(),
            scenario: "RATE_LIMIT",
            patientPesel: "44051401458",
            barcode: "SMP-RL-0025",
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
      expect(response.body).not.toContain("SMP-RL-0025");
    });

    it("callback po udanym ponowieniu zapisuje wyniki i kończy zlecenie jako COMPLETED", async () => {
      const { token, orderId } = await createSendableOrder("SMP-RL-0026");
      expect((await sendOrder(token, orderId)).statusCode).toBe(429);
      await makeRetryJobDue(orderId);
      await labSendRetry.processDueJobs(new Date());

      const labJob = await prisma.labJob.findFirstOrThrow({ where: { orderId } });
      await app
        .get(LabCallbacksService)
        .processResults(labJob.payload as never);

      const persisted = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(persisted.status).toBe("COMPLETED");
      expect(await prisma.result.count({ where: { orderId } })).toBeGreaterThan(0);
      expect(await readEventTypes(orderId)).toContain("LAB_RESULT_RECEIVED");
    });

    it("respektuje izolację workspace'u i nie tworzy zadania dla obcego zlecenia", async () => {
      const { orderId } = await createSendableOrder("SMP-RL-0027");
      const { user } = await createStaffUser(prisma, {
        workspaceSlug: "obca-klinika-rate-limit",
        workspaceName: "Obca Klinika Limit",
        login: "staff.obcy.ratelimit",
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
      expect(await prisma.labSendRetryJob.count({ where: { orderId } })).toBe(0);
      expect(await prisma.idempotencyKey.count({ where: { orderId } })).toBe(0);
    });
  });

  describe("brak regresji pozostałych scenariuszy", () => {
    it("SUCCESS nadal przyjmuje zlecenie bez zadania ponowienia", async () => {
      await setWorkshopConfig(app, { labScenario: "SUCCESS" });
      const { token, orderId } = await createSendableOrder("SMP-RL-0028");

      const response = await sendOrder(token, orderId);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).status).toBe("SENT_TO_LAB");
      expect(await prisma.labSendRetryJob.count({ where: { orderId } })).toBe(0);
      expect(await prisma.labJob.count({ where: { orderId } })).toBe(1);
    });

    it("VALIDATION_ERROR nadal zwraca 422 i NIE jest automatycznie ponawiany", async () => {
      await setWorkshopConfig(app, { labScenario: "VALIDATION_ERROR" });
      const { token, orderId } = await createSendableOrder("SMP-RL-0029");

      const response = await sendOrder(token, orderId);

      expect(response.statusCode).toBe(422);
      expect(JSON.parse(response.body).error.code).toBe("LAB_ORDER_VALIDATION_ERROR");
      // Brak klucza idempotencji i brak zadania ponowienia — 422 nie jest ponawiane.
      expect(await prisma.idempotencyKey.count({ where: { orderId } })).toBe(0);
      expect(await prisma.labSendRetryJob.count({ where: { orderId } })).toBe(0);
      expect(await labSendRetry.processDueJobs(new Date())).toBe(0);
    });

    it("PARTIAL_SUCCESS i SAMPLE_REJECTED nadal działają bez kolejki ponowień", async () => {
      await setWorkshopConfig(app, { labScenario: "PARTIAL_SUCCESS" });
      const partial = await createSendableOrder("SMP-RL-0030", ["MORF", "CRP"]);
      expect((await sendOrder(partial.token, partial.orderId)).statusCode).toBe(200);
      expect(await prisma.labJob.count({ where: { orderId: partial.orderId } })).toBe(2);

      await setWorkshopConfig(app, { labScenario: "SAMPLE_REJECTED" });
      const rejected = await createSendableOrder("SMP-RL-0031");
      expect((await sendOrder(rejected.token, rejected.orderId)).statusCode).toBe(200);
      expect(await prisma.labJob.count({ where: { orderId: rejected.orderId } })).toBe(1);

      expect(await prisma.labSendRetryJob.count()).toBe(0);
    });
  });

  it("dokumentuje w OpenAPI odpowiedź 429 razem z nagłówkiem Retry-After", async () => {
    const response = await app.inject({ method: "GET", url: "/api/docs-json" });
    const document = JSON.parse(response.body);
    const send = document.paths["/api/v1/orders/{orderId}/send"].post;

    expect(send.responses["429"]).toBeDefined();
    const serialized = JSON.stringify(send.responses["429"]);
    expect(serialized).toContain("LAB_RATE_LIMITED");
    expect(serialized).toContain("correlationId");
    expect(send.responses["429"].headers["Retry-After"]).toBeDefined();
    expect(send.responses["429"].headers["X-Correlation-ID"]).toBeDefined();
    expect(serialized).toContain("SAMPLE_COLLECTED");
    // Publiczna dokumentacja nie ujawnia, jak aktywować scenariusz.
    expect(serialized).not.toContain("LAB_SIMULATOR_SCENARIO");

    const eventTypes =
      document.components.schemas.OrderHistoryItemDto.properties.eventType.enum;
    expect(eventTypes).toContain("LAB_RATE_LIMIT_RECEIVED");
    expect(eventTypes).toContain("LAB_SEND_RETRY");
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
   * Przesuwa termin zadania ponowienia w przeszłość.
   *
   * Dzięki temu testy sprawdzają realną ścieżkę schedulera bez czekania
   * 15 sekund — kontrolujemy czas przez dane, a nie przez `setTimeout`.
   */
  async function makeRetryJobDue(orderId: string) {
    await prisma.labSendRetryJob.updateMany({
      where: { orderId },
      data: { executeAt: new Date(Date.now() - 1_000) }
    });
  }

  /**
   * Dezaktywuje pacjenta „w tle”, między pierwszą odpowiedzią 429 a wykonaniem
   * ponowienia — tak jak zrobiłby to inny użytkownik w osobnym żądaniu.
   */
  async function deactivatePatient(patientId: string) {
    await prisma.patient.update({ where: { id: patientId }, data: { active: false } });
  }

  async function readEventTypes(orderId: string) {
    return (
      await prisma.orderHistory.findMany({
        where: { orderId },
        select: { eventType: true },
        orderBy: { sequence: "asc" }
      })
    ).map((entry) => entry.eventType as string);
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
      select: { id: true, status: true },
      orderBy: { id: "asc" }
    });
  }

  /**
   * Tworzy zlecenie gotowe do wysyłki: status SAMPLE_COLLECTED z pobranymi
   * próbkami. Korzysta z pacjenta z seeda, żeby nie duplikować numeru PESEL
   * w workspace.
   */
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
    let lastStatus = "";
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
      lastStatus = JSON.parse(sampleResponse.body).status;
    }
    expect(lastStatus).toBe("SAMPLE_COLLECTED");

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
