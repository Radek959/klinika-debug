import type { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { provisionWorkshopWorkspaces } from "../src/common/prisma/seed-workshop";
import { closeTestApp, createTestApp } from "./test-app";
import {
  configureTestEnvironment,
  resetTestDatabase,
  TEST_ADMIN_PASSWORD
} from "./database";

describe("panel /admin", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const originalWorkshopPassword = process.env.WORKSHOP_STAFF_PASSWORD;
  const originalLabDelayMs = process.env.LAB_SIMULATOR_DELAY_MS;

  beforeAll(async () => {
    configureTestEnvironment();
    process.env.WORKSHOP_STAFF_PASSWORD = "WarsztatTestowe123!";
    // Ten plik sprawdza wprost bootstrapowaną wartość domyślną labDelayMs
    // (300000 ms) — bez usunięcia zmiennej odziedziczonej po
    // `configureTestEnvironment()` (używanej gdzie indziej do przyspieszenia
    // e2e) bootstrap tego pliku zależałby od kolejności uruchomienia testów.
    delete process.env.LAB_SIMULATOR_DELAY_MS;
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    await prisma.workshopConfig.deleteMany();
  });

  afterAll(async () => {
    if (originalWorkshopPassword === undefined) {
      delete process.env.WORKSHOP_STAFF_PASSWORD;
    } else {
      process.env.WORKSHOP_STAFF_PASSWORD = originalWorkshopPassword;
    }
    if (originalLabDelayMs === undefined) {
      delete process.env.LAB_SIMULATOR_DELAY_MS;
    } else {
      process.env.LAB_SIMULATOR_DELAY_MS = originalLabDelayMs;
    }
    await closeTestApp(app);
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
    expect(cookie).toBeDefined();
    return String(cookie).split(";")[0];
  }

  it("GET /admin zwraca stronę HTML z tytułem panelu prowadzącego", async () => {
    const response = await app.inject({ method: "GET", url: "/admin" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("Klinika Debug — panel prowadzącego");
  });

  it("odrzuca żądania do API panelu bez uwierzytelnienia", async () => {
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/admin/api/config" }),
      app.inject({
        method: "PUT",
        url: "/admin/api/config",
        payload: { labScenario: "SUCCESS", controlledBug: "CLEAN" }
      }),
      app.inject({
        method: "POST",
        url: "/admin/api/reset",
        payload: { confirm: true }
      })
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("ADMIN_AUTHENTICATION_REQUIRED");
      expect(body.error.correlationId).toBeTruthy();
    }
  });

  it("odrzuca logowanie z błędnym hasłem i nie ustawia ciasteczka sesji", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/api/login",
      payload: { password: "zle-haslo" }
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error.code).toBe("ADMIN_INVALID_CREDENTIALS");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("poprawne hasło loguje i ustawia ciasteczko HttpOnly, SameSite=Strict, bez Secure poza produkcją", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/api/login",
      payload: { password: TEST_ADMIN_PASSWORD }
    });

    expect(response.statusCode).toBe(200);
    const cookieHeader = String(
      Array.isArray(response.headers["set-cookie"])
        ? response.headers["set-cookie"][0]
        : response.headers["set-cookie"]
    );
    expect(cookieHeader).toContain("klinika_admin_session=");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("SameSite=Strict");
    expect(cookieHeader).not.toContain("Secure");
    expect(cookieHeader).toContain("Path=/admin");
  });

  it("po zalogowaniu zwraca domyślną konfigurację SUCCESS + CLEAN i listę dozwolonych wartości", async () => {
    const cookie = await loginAsAdmin();

    const response = await app.inject({
      method: "GET",
      url: "/admin/api/config",
      headers: { cookie }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.labScenario).toBe("SUCCESS");
    expect(body.controlledBug).toBe("CLEAN");
    expect(body.labDelayMs).toBe(300000);
    expect(body.availableLabScenarios).toEqual([
      "SUCCESS",
      "PARTIAL_SUCCESS",
      "SAMPLE_REJECTED",
      "VALIDATION_ERROR",
      "RATE_LIMIT",
      "SERVER_ERROR",
      "TIMEOUT"
    ]);
    expect(body.availableControlledBugs).toEqual([
      "CLEAN",
      "PATIENT_GUARDIAN",
      "ORDER_FLOW",
      "API_DIAGNOSTICS"
    ]);
    expect(body.availableLabDelaysMs).toEqual([5000, 15000, 30000, 60000, 300000]);
  });

  it("zapisuje wybrany preset labDelayMs i odrzuca dowolną (arbitrary) wartość", async () => {
    const cookie = await loginAsAdmin();

    for (const preset of [5000, 15000, 30000, 60000, 300000]) {
      const updateOk = await app.inject({
        method: "PUT",
        url: "/admin/api/config",
        headers: { cookie },
        payload: { labScenario: "SUCCESS", controlledBug: "CLEAN", labDelayMs: preset }
      });
      expect(updateOk.statusCode).toBe(200);
      expect(JSON.parse(updateOk.body).labDelayMs).toBe(preset);
    }

    const updateBadDelay = await app.inject({
      method: "PUT",
      url: "/admin/api/config",
      headers: { cookie },
      payload: { labScenario: "SUCCESS", controlledBug: "CLEAN", labDelayMs: 12345 }
    });
    expect(updateBadDelay.statusCode).toBe(400);
  });

  it("nowa wysyłka używa nowego labDelayMs, ale już zaplanowany lab_job.executeAt się nie przesuwa", async () => {
    const cookie = await loginAsAdmin();
    await app.inject({
      method: "PUT",
      url: "/admin/api/config",
      headers: { cookie },
      payload: { labScenario: "SUCCESS", controlledBug: "CLEAN", labDelayMs: 5000 }
    });

    const first = await bootstrapOrderReadyToSend(app, prisma);
    const beforeFirstSend = Date.now();
    const firstSend = await app.inject({
      method: "POST",
      url: `/api/v1/orders/${first.order.id}/send`,
      headers: { authorization: `Bearer ${first.token}` }
    });
    expect(firstSend.statusCode).toBe(200);

    const jobBefore = await prisma.labJob.findFirstOrThrow({ where: { orderId: first.order.id } });
    const orderBefore = await prisma.order.findUniqueOrThrow({ where: { id: first.order.id } });
    const firstOffsetMs = orderBefore.estimatedCompletionAt!.getTime() - beforeFirstSend;
    expect(firstOffsetMs).toBeGreaterThanOrEqual(4000);
    expect(firstOffsetMs).toBeLessThan(100000);

    // Runtime switch bez restartu aplikacji.
    await app.inject({
      method: "PUT",
      url: "/admin/api/config",
      headers: { cookie },
      payload: { labScenario: "SUCCESS", controlledBug: "CLEAN", labDelayMs: 300000 }
    });

    // Zadanie zaplanowane PRZED zmianą konfiguracji nie przesuwa się.
    const jobAfter = await prisma.labJob.findFirstOrThrow({ where: { id: jobBefore.id } });
    const orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: first.order.id } });
    expect(jobAfter.executeAt.getTime()).toBe(jobBefore.executeAt.getTime());
    expect(orderAfter.estimatedCompletionAt!.getTime()).toBe(
      orderBefore.estimatedCompletionAt!.getTime()
    );

    // NOWA wysyłka (innego zlecenia) już używa nowo skonfigurowanego delay.
    const second = await bootstrapOrderReadyToSend(app, prisma);
    const beforeSecondSend = Date.now();
    const secondSend = await app.inject({
      method: "POST",
      url: `/api/v1/orders/${second.order.id}/send`,
      headers: { authorization: `Bearer ${second.token}` }
    });
    expect(secondSend.statusCode).toBe(200);

    const secondOrder = await prisma.order.findUniqueOrThrow({ where: { id: second.order.id } });
    const secondOffsetMs = secondOrder.estimatedCompletionAt!.getTime() - beforeSecondSend;
    expect(secondOffsetMs).toBeGreaterThanOrEqual(290000);
    expect(secondOffsetMs).toBeLessThanOrEqual(310000);
  });

  it("zapisuje nowy scenariusz laboratorium i akceptuje dozwolony kontrolowany błąd", async () => {
    const cookie = await loginAsAdmin();

    const updateOk = await app.inject({
      method: "PUT",
      url: "/admin/api/config",
      headers: { cookie },
      payload: { labScenario: "SERVER_ERROR", controlledBug: "CLEAN", labDelayMs: 300000 }
    });
    expect(updateOk.statusCode).toBe(200);
    expect(JSON.parse(updateOk.body).labScenario).toBe("SERVER_ERROR");

    const updateAllowedBug = await app.inject({
      method: "PUT",
      url: "/admin/api/config",
      headers: { cookie },
      payload: { labScenario: "SUCCESS", controlledBug: "PATIENT_GUARDIAN", labDelayMs: 300000 }
    });
    expect(updateAllowedBug.statusCode).toBe(200);
    expect(JSON.parse(updateAllowedBug.body).controlledBug).toBe("PATIENT_GUARDIAN");

    const updateBadBug = await app.inject({
      method: "PUT",
      url: "/admin/api/config",
      headers: { cookie },
      payload: { labScenario: "SUCCESS", controlledBug: "NOT_A_CONTROLLED_BUG", labDelayMs: 300000 }
    });
    expect(updateBadBug.statusCode).toBe(400);

    const updateBadScenario = await app.inject({
      method: "PUT",
      url: "/admin/api/config",
      headers: { cookie },
      payload: { labScenario: "NOT_A_SCENARIO", controlledBug: "CLEAN", labDelayMs: 300000 }
    });
    expect(updateBadScenario.statusCode).toBe(400);
  });

  it("zmiana scenariusza wpływa na NOWĄ wysyłkę, ale nie na już zaplanowane ponowienie", async () => {
    const cookie = await loginAsAdmin();
    const bootstrap = await bootstrapOrderReadyToSend(app, prisma);

    // Ustaw RATE_LIMIT: pierwsza wysyłka utworzy trwałe zadanie ponowienia,
    // które zapisuje scenariusz w chwili utworzenia (RATE_LIMIT).
    await app.inject({
      method: "PUT",
      url: "/admin/api/config",
      headers: { cookie },
      payload: { labScenario: "RATE_LIMIT", controlledBug: "CLEAN", labDelayMs: 300000 }
    });

    const sendResponse = await app.inject({
      method: "POST",
      url: `/api/v1/orders/${bootstrap.order.id}/send`,
      headers: { authorization: `Bearer ${bootstrap.token}` }
    });
    expect(sendResponse.statusCode).toBe(429);

    const retryJob = await prisma.labSendRetryJob.findFirstOrThrow({
      where: { orderId: bootstrap.order.id }
    });
    expect(retryJob.scenario).toBe("RATE_LIMIT");

    // Zmiana konfiguracji PO utworzeniu zadania nie może zmienić scenariusza
    // już zaplanowanego ponowienia.
    await app.inject({
      method: "PUT",
      url: "/admin/api/config",
      headers: { cookie },
      payload: { labScenario: "SUCCESS", controlledBug: "CLEAN", labDelayMs: 300000 }
    });

    const retryJobAfter = await prisma.labSendRetryJob.findUniqueOrThrow({
      where: { id: retryJob.id }
    });
    expect(retryJobAfter.scenario).toBe("RATE_LIMIT");
  });

  it("reset wymaga confirm=true, resetuje workspace'y i przywraca SUCCESS + CLEAN + 300000 ms", async () => {
    const cookie = await loginAsAdmin();
    await provisionWorkshopWorkspaces(prisma, 1);

    const rejected = await app.inject({
      method: "POST",
      url: "/admin/api/reset",
      headers: { cookie },
      payload: { confirm: false }
    });
    expect(rejected.statusCode).toBe(400);

    await app.inject({
      method: "PUT",
      url: "/admin/api/config",
      headers: { cookie },
      payload: { labScenario: "TIMEOUT", controlledBug: "CLEAN", labDelayMs: 5000 }
    });

    const response = await app.inject({
      method: "POST",
      url: "/admin/api/reset",
      headers: { cookie },
      payload: { confirm: true }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.resetWorkspaceSlugs).toEqual(["warsztat-01"]);
    expect(body.config.labScenario).toBe("SUCCESS");
    expect(body.config.controlledBug).toBe("CLEAN");
    expect(body.config.labDelayMs).toBe(300000);
  });

  it("reset nigdy nie dotyka klinika-pokazowa ani innych workspace'ów spoza wzorca warsztatowego", async () => {
    const cookie = await loginAsAdmin();
    await provisionWorkshopWorkspaces(prisma, 1);
    const demo = await prisma.workspace.create({
      data: { slug: "klinika-pokazowa", name: "Klinika Pokazowa" }
    });
    const patientBefore = await prisma.patient.create({
      data: {
        workspaceId: demo.id,
        firstName: "Nie",
        lastName: "Ruszaj",
        identifierType: "PESEL",
        pesel: "44051401458",
        birthDate: new Date("1944-05-14T00:00:00.000Z"),
        gender: "MALE"
      }
    });

    await app.inject({
      method: "POST",
      url: "/admin/api/reset",
      headers: { cookie },
      payload: { confirm: true }
    });

    await expect(
      prisma.patient.findUnique({ where: { id: patientBefore.id } })
    ).resolves.not.toBeNull();
  });

  it("odpowiedzi API uczestnika nie ujawniają konfiguracji panelu /admin", async () => {
    await provisionWorkshopWorkspaces(prisma, 1);
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "tester01", password: "WarsztatTestowe123!" }
    });
    expect(loginResponse.statusCode).toBe(200);
    const { token } = JSON.parse(loginResponse.body);

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(meResponse.body).not.toContain("labScenario");
    expect(meResponse.body).not.toContain("controlledBug");
    expect(meResponse.body.toLowerCase()).not.toContain("admin");
  });

  it("dokumentacja OpenAPI uczestnika nie zawiera endpointów panelu /admin", async () => {
    const response = await app.inject({ method: "GET", url: "/api/docs-json" });

    expect(response.statusCode).toBe(200);
    const document = JSON.parse(response.body);
    const paths = Object.keys(document.paths ?? {});

    expect(paths.some((path) => path.includes("admin"))).toBe(false);
  });
});

async function bootstrapOrderReadyToSend(
  app: NestFastifyApplication,
  prisma: PrismaClient
) {
  // Sufiks unikalny per wywołanie — pozwala wywołać helper wielokrotnie w
  // jednym teście (np. porównanie delay starej i nowej wysyłki) bez kolizji
  // na unikalnym slug/login.
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workspace = await prisma.workspace.create({
    data: { slug: `admin-scenario-test-${suffix}`, name: "Admin Scenario Test" }
  });
  const argon2 = await import("argon2");
  const user = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      login: `admin-scenario-staff-${suffix}`,
      displayName: "Personel testowy",
      role: "STAFF",
      passwordHash: await argon2.hash("HasloTestowe123!", { type: argon2.argon2id })
    }
  });

  const patient = await prisma.patient.create({
    data: {
      workspaceId: workspace.id,
      firstName: "Jan",
      lastName: "Testowy",
      identifierType: "PESEL",
      pesel: "89112302659",
      birthDate: new Date("1989-11-23T00:00:00.000Z"),
      gender: "MALE"
    }
  });

  const medicalTest = await prisma.medicalTest.create({
    data: {
      code: `ADMIN-TEST-${Date.now()}`,
      name: "Test administracyjny",
      description: "Badanie testowe do scenariusza panelu /admin.",
      materialType: "SERUM",
      estimatedDurationMinutes: 30,
      parameters: {
        create: [{ code: "PARAM", name: "Parametr", valueType: "NUMERIC", unit: "j.", displayOrder: 1 }]
      }
    }
  });

  const order = await prisma.order.create({
    data: {
      workspaceId: workspace.id,
      patientId: patient.id,
      createdByUserId: user.id,
      priority: "ROUTINE",
      status: "SAMPLE_COLLECTED",
      tests: { create: [{ medicalTestId: medicalTest.id }] },
      samples: {
        create: [
          {
            materialType: "SERUM",
            status: "COLLECTED",
            collectedAt: new Date(),
            collectedByUserId: user.id
          }
        ]
      }
    }
  });

  const loginResponse = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { login: user.login, password: "HasloTestowe123!" }
  });
  const { token } = JSON.parse(loginResponse.body) as { token: string };

  return { workspace, user, patient, order, token };
}
