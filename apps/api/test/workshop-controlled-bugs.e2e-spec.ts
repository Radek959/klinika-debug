import type { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { seedDatabase } from "../src/common/prisma/seed-database";
import { closeTestApp, createTestApp } from "./test-app";
import {
  configureTestEnvironment,
  createStaffUser,
  resetTestDatabase,
  setWorkshopConfig,
  TEST_ADMIN_PASSWORD
} from "./database";

/**
 * End-to-end coverage for the three workshop controlled defects
 * (`PATIENT_GUARDIAN`, `ORDER_FLOW`, `API_DIAGNOSTICS`) wired through the
 * `/admin` panel from `workshop-trainer-controls`. Per-rule unit coverage
 * lives in `apps/api/src/patients/patient-write-domain.spec.ts` and
 * `packages/domain/src/orders/sample-collection.spec.ts` — this file checks
 * the integration: reading the globally configured controlled bug at
 * runtime, toggling without restart, one bug not activating another, no
 * leak of the defect name to a public response, and reset restoring CLEAN.
 */
describe("workshop controlled bugs", () => {
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
    // resetTestDatabase() usuwa wiersz `workshop_config`, ale nie czyści cache'a
    // w pamięci WorkshopConfigService (żyje na instancji aplikacji utworzonej
    // raz w beforeAll) — bez tego kontrolowany błąd ustawiony w jednym teście
    // (przez `setControlledBug`, realny endpoint `/admin/api/config`) przeciekałby
    // do kolejnego testu w tym samym pliku, mimo usuniętego wiersza w bazie.
    await setWorkshopConfig(app, { labScenario: "SUCCESS" });
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  describe("PATIENT_GUARDIAN", () => {
    const minorWithoutGuardian = {
      firstName: "Maja",
      lastName: "Syntetyczna",
      identifierType: "PESEL" as const,
      pesel: "18210199982",
      birthDate: "2018-01-01",
      gender: "FEMALE" as const,
      phone: "123456789"
    };

    it("[CLEAN] odrzuca pacjenta niepełnoletniego bez opiekuna", async () => {
      const { token } = await login();

      const response = await createPatient(token, minorWithoutGuardian);

      expect(response.statusCode).toBe(422);
      expect(extractFieldErrors(response)).toContainEqual(
        expect.objectContaining({ field: "guardian", code: "GUARDIAN_REQUIRED" })
      );
    });

    it("[DEFEKT AKTYWNY] akceptuje pacjenta niepełnoletniego bez opiekuna, gdy PATIENT_GUARDIAN jest aktywny", async () => {
      const { token } = await login();
      await setControlledBug("PATIENT_GUARDIAN");

      const response = await createPatient(token, minorWithoutGuardian);

      expect(response.statusCode).toBe(201);
    });

    it("przełącza się CLEAN -> BUG -> CLEAN bez restartu aplikacji", async () => {
      const { token } = await login();

      expect((await createPatient(token, minorWithoutGuardian)).statusCode).toBe(422);

      await setControlledBug("PATIENT_GUARDIAN");
      expect((await createPatient(token, minorWithoutGuardian)).statusCode).toBe(201);

      await setControlledBug("CLEAN");
      expect((await createPatient(token, minorWithoutGuardian)).statusCode).toBe(422);
    });

    it("nie ujawnia nazwy defektu w publicznej odpowiedzi", async () => {
      const { token } = await login();

      const response = await createPatient(token, minorWithoutGuardian);

      expect(response.body).not.toContain("PATIENT_GUARDIAN");
    });

    // Regresja: frontend kiedyś budował dla niepełnoletniego pacjenta payload z
    // pustym obiektem `guardian` (wszystkie pola null) zamiast pomijać `guardian`
    // w ogóle. Backend traktuje jawnie podany obiekt guardian jako "opiekun
    // został podany" i uruchamia zwykłą walidację jego pól — nawet gdy
    // PATIENT_GUARDIAN jest aktywny. Fix żyje we frontendowym budowaniu payloadu
    // (`patientFormState.ts`), ten test dokumentuje oczekiwane zachowanie API dla
    // takiego (już niewysyłanego przez naprawiony frontend) payloadu.
    const minorWithExplicitEmptyGuardian = {
      ...minorWithoutGuardian,
      guardian: { firstName: null, lastName: null, phone: null, email: null }
    };

    it("[CLEAN] jawnie pusty obiekt guardian nadal skutkuje 422 (walidacja pól opiekuna)", async () => {
      const { token } = await login();

      const response = await createPatient(token, minorWithExplicitEmptyGuardian);

      expect(response.statusCode).toBe(422);
    });

    it("[DEFEKT AKTYWNY] jawnie pusty obiekt guardian nadal skutkuje 422, mimo że PATIENT_GUARDIAN jest aktywny — dowód, że naprawiony frontend musi POMIJAĆ guardian, a nie wysyłać go pusty", async () => {
      const { token } = await login();
      await setControlledBug("PATIENT_GUARDIAN");

      const response = await createPatient(token, minorWithExplicitEmptyGuardian);

      expect(response.statusCode).toBe(422);
      expect(extractFieldErrors(response)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "guardian.firstName" }),
          expect.objectContaining({ field: "guardian.lastName" })
        ])
      );
    });

    it("[DEFEKT AKTYWNY] częściowo uzupełniony opiekun nadal podlega normalnej walidacji danych opiekuna", async () => {
      const { token } = await login();
      await setControlledBug("PATIENT_GUARDIAN");

      const response = await createPatient(token, {
        ...minorWithoutGuardian,
        guardian: { firstName: "Anna", lastName: null, phone: null, email: null }
      });

      expect(response.statusCode).toBe(422);
      expect(extractFieldErrors(response)).toContainEqual(
        expect.objectContaining({ field: "guardian.lastName", code: "REQUIRED" })
      );
    });
  });

  describe("ORDER_FLOW", () => {
    it("[CLEAN] ustawia SAMPLE_COLLECTION_IN_PROGRESS po pierwszej z dwóch wymaganych próbek", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });

      const registered = await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-OF-CLEAN-0001",
        collectedAt: nowIso()
      });

      expect(registered.status).toBe("SAMPLE_COLLECTION_IN_PROGRESS");
    });

    it("[DEFEKT AKTYWNY] ustawia SAMPLE_COLLECTED po PIERWSZEJ z dwóch wymaganych próbek, gdy ORDER_FLOW jest aktywny", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      await setControlledBug("ORDER_FLOW");
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });

      const registered = await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-OF-BUG-0001",
        collectedAt: nowIso()
      });

      expect(registered.status).toBe("SAMPLE_COLLECTED");
      // Materiał EDTA_BLOOD nadal formalnie wymagany — defekt dotyczy tylko
      // przejścia statusu zlecenia, nie samego stanu próbki.
      const edtaSample = registered.samples.find(
        (sample: { materialType: string }) => sample.materialType === "EDTA_BLOOD"
      );
      expect(edtaSample.status).toBe("REQUIRED");
    });

    it("ORDER_FLOW nie osłabia blokady wysyłki, gdy żadna próbka nie została zarejestrowana", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      await setControlledBug("ORDER_FLOW");
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      });

      const response = await sendOrder(token, order.id);

      expect(response.statusCode).toBe(422);
      expect(JSON.parse(response.body).error.fieldErrors).toContainEqual(
        expect.objectContaining({ field: "status", code: "ORDER_NOT_SENDABLE" })
      );
    });

    it("przełącza się CLEAN -> BUG -> CLEAN bez restartu aplikacji", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const payload = {
        patientId,
        priority: "ROUTINE" as const,
        tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
      };

      const orderClean = await createOrderAndParse(token, payload);
      const cleanResult = await registerSample(token, orderClean.id, {
        materialType: "SERUM",
        barcode: "SMP-OF-TOGGLE-0001",
        collectedAt: nowIso()
      });
      expect(cleanResult.status).toBe("SAMPLE_COLLECTION_IN_PROGRESS");

      await setControlledBug("ORDER_FLOW");
      const orderBug = await createOrderAndParse(token, payload);
      const bugResult = await registerSample(token, orderBug.id, {
        materialType: "SERUM",
        barcode: "SMP-OF-TOGGLE-0002",
        collectedAt: nowIso()
      });
      expect(bugResult.status).toBe("SAMPLE_COLLECTED");

      await setControlledBug("CLEAN");
      const orderAfter = await createOrderAndParse(token, payload);
      const afterResult = await registerSample(token, orderAfter.id, {
        materialType: "SERUM",
        barcode: "SMP-OF-TOGGLE-0003",
        collectedAt: nowIso()
      });
      expect(afterResult.status).toBe("SAMPLE_COLLECTION_IN_PROGRESS");
    });
  });

  describe("API_DIAGNOSTICS", () => {
    it("[CLEAN] wysyła zlecenie z badaniem TSH normalnie", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.TSH.id }]
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-AD-CLEAN-0001",
        collectedAt: nowIso()
      });

      const response = await sendOrder(token, order.id);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).status).toBe("SENT_TO_LAB");
    });

    it("[DEFEKT AKTYWNY] odrzuca wysyłkę zlecenia z badaniem TSH kodem 500 PRZED wywołaniem laboratorium", async () => {
      const { token, patientId, tests, workspaceId } = await setupDefaultOrderData();
      await setControlledBug("API_DIAGNOSTICS");
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.TSH.id }]
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-AD-BUG-0001",
        collectedAt: nowIso()
      });

      const response = await sendOrder(token, order.id);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(body.error.correlationId).toBeTruthy();
      // Brak wycieku nazwy defektu, wewnętrznego przełącznika, sekretów i stack trace'a.
      expect(response.body).not.toContain("API_DIAGNOSTICS");
      expect(response.body.toLowerCase()).not.toContain("stack");
      expect(response.body).not.toContain("ADMIN_SESSION_SECRET");
      expect(response.body).not.toContain("ADMIN_PASSWORD_HASH");

      const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(persisted.status).toBe("SAMPLE_COLLECTED");
      expect(persisted.externalOrderId).toBeNull();
      expect(persisted.sentAt).toBeNull();

      await expect(
        prisma.idempotencyKey.findMany({ where: { workspaceId, orderId: order.id } })
      ).resolves.toEqual([]);
      await expect(
        prisma.labJob.findMany({ where: { workspaceId, orderId: order.id } })
      ).resolves.toEqual([]);
      await expect(
        prisma.labSendRetryJob.findMany({ where: { workspaceId, orderId: order.id } })
      ).resolves.toEqual([]);
    });

    it("nie aktywuje się dla zlecenia bez badania TSH, mimo aktywnego API_DIAGNOSTICS", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      await setControlledBug("API_DIAGNOSTICS");
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-AD-NOTSH-0001",
        collectedAt: nowIso()
      });

      const response = await sendOrder(token, order.id);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).status).toBe("SENT_TO_LAB");
    });

    it("zlecenie pozostaje możliwe do ponowienia po dezaktywacji defektu", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      await setControlledBug("API_DIAGNOSTICS");
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.TSH.id }]
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-AD-RETRY-0001",
        collectedAt: nowIso()
      });

      const failed = await sendOrder(token, order.id);
      expect(failed.statusCode).toBe(500);

      await setControlledBug("CLEAN");
      const retried = await sendOrder(token, order.id);

      expect(retried.statusCode).toBe(200);
      expect(JSON.parse(retried.body).status).toBe("SENT_TO_LAB");
    });
  });

  describe("zachowania współdzielone", () => {
    it("aktywny jeden defekt nie aktywuje zachowania innego defektu", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      await setControlledBug("ORDER_FLOW");

      // PATIENT_GUARDIAN musi nadal działać w trybie CLEAN.
      const patientResponse = await createPatient(token, {
        firstName: "Maja",
        lastName: "Syntetyczna",
        identifierType: "PESEL",
        pesel: "18210199982",
        birthDate: "2018-01-01",
        gender: "FEMALE",
        phone: "123456789"
      });
      expect(patientResponse.statusCode).toBe(422);

      // API_DIAGNOSTICS musi nadal działać w trybie CLEAN: TSH wysyła się normalnie.
      const order = await createOrderAndParse(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.TSH.id }]
      });
      await registerSample(token, order.id, {
        materialType: "SERUM",
        barcode: "SMP-CROSS-0001",
        collectedAt: nowIso()
      });
      const sendResponse = await sendOrder(token, order.id);
      expect(sendResponse.statusCode).toBe(200);
    });

    it("reset przywraca CLEAN i wyłącza aktywny defekt", async () => {
      const { token } = await login();
      await setControlledBug("PATIENT_GUARDIAN");

      const adminCookie = await loginAsAdmin();
      const resetResponse = await app.inject({
        method: "POST",
        url: "/admin/api/reset",
        headers: { cookie: adminCookie },
        payload: { confirm: true }
      });
      expect(resetResponse.statusCode).toBe(200);
      expect(JSON.parse(resetResponse.body).config.controlledBug).toBe("CLEAN");

      const response = await createPatient(token, {
        firstName: "Maja",
        lastName: "Syntetyczna",
        identifierType: "PESEL",
        pesel: "18210199982",
        birthDate: "2018-01-01",
        gender: "FEMALE",
        phone: "123456789"
      });
      expect(response.statusCode).toBe(422);
    });

    it("izolacja workspace'ów pozostaje nienaruszona, gdy defekt jest aktywny", async () => {
      await setControlledBug("PATIENT_GUARDIAN");

      await createStaffUser(prisma, {
        workspaceSlug: "workspace-cb-a",
        workspaceName: "Klinika CB A",
        login: "staff.cb.a",
        password: "HasloTestowe123!"
      });
      const loginA = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { login: "staff.cb.a", password: "HasloTestowe123!" }
      });
      const tokenA = JSON.parse(loginA.body).token as string;

      const patientResponse = await createPatient(tokenA, {
        firstName: "Ola",
        lastName: "WorkspaceA",
        identifierType: "PESEL",
        pesel: "18210199982",
        birthDate: "2018-01-01",
        gender: "FEMALE",
        phone: "123456789"
      });
      expect(patientResponse.statusCode).toBe(201);
      const patientA = JSON.parse(patientResponse.body);

      await createStaffUser(prisma, {
        workspaceSlug: "workspace-cb-b",
        workspaceName: "Klinika CB B",
        login: "staff.cb.b",
        password: "HasloTestowe123!"
      });
      const loginB = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { login: "staff.cb.b", password: "HasloTestowe123!" }
      });
      const tokenB = JSON.parse(loginB.body).token as string;

      const crossWorkspaceResponse = await app.inject({
        method: "GET",
        url: `/api/v1/patients/${patientA.id}`,
        headers: { authorization: `Bearer ${tokenB}` }
      });

      expect(crossWorkspaceResponse.statusCode).toBe(404);
    });
  });

  async function loginAsAdmin(): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/admin/api/login",
      payload: { password: TEST_ADMIN_PASSWORD }
    });
    expect(response.statusCode).toBe(200);
    const cookieHeader = response.headers["set-cookie"];
    const cookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    return String(cookie).split(";")[0];
  }

  async function setControlledBug(controlledBug: string): Promise<void> {
    const cookie = await loginAsAdmin();
    const response = await app.inject({
      method: "PUT",
      url: "/admin/api/config",
      headers: { cookie },
      payload: { labScenario: "SUCCESS", controlledBug, labDelayMs: 300000 }
    });
    expect(response.statusCode).toBe(200);
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

  async function createPatient(token: string, payload: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { authorization: `Bearer ${token}` },
      payload
    });
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

  function nowIso() {
    return new Date().toISOString();
  }

  function extractFieldErrors(response: { body: string }) {
    return JSON.parse(response.body).error.fieldErrors;
  }
});
