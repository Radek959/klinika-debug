import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { seedDatabase } from "../src/common/prisma/seed-database";
import { provisionWorkshopWorkspaces } from "../src/common/prisma/seed-workshop";
import { resetWorkshopWorkspaces } from "../src/common/prisma/reset-workshop";
import { closeTestApp, createTestApp } from "./test-app";
import {
  configureTestEnvironment,
  createStaffUser,
  createTestPatient,
  resetTestDatabase
} from "./database";

describe("workshop reset", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const originalWorkshopPassword = process.env.WORKSHOP_STAFF_PASSWORD;
  const originalSeedPassword = process.env.SEED_STAFF_PASSWORD;

  beforeAll(async () => {
    configureTestEnvironment();
    process.env.WORKSHOP_STAFF_PASSWORD = "WarsztatTestowe123!";
    process.env.SEED_STAFF_PASSWORD = "SeedTestowe123!";
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    if (originalWorkshopPassword === undefined) {
      delete process.env.WORKSHOP_STAFF_PASSWORD;
    } else {
      process.env.WORKSHOP_STAFF_PASSWORD = originalWorkshopPassword;
    }
    if (originalSeedPassword === undefined) {
      delete process.env.SEED_STAFF_PASSWORD;
    } else {
      process.env.SEED_STAFF_PASSWORD = originalSeedPassword;
    }
    await closeTestApp(app);
  });

  it("wymaga jawnego potwierdzenia i nie wykonuje resetu bez niego", async () => {
    await provisionWorkshopWorkspaces(prisma, 1);

    await expect(
      resetWorkshopWorkspaces(prisma, { confirm: false })
    ).rejects.toThrow(/potwierdzenia/);

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { slug: "warsztat-01" }
    });
    await expect(
      prisma.patient.count({ where: { workspaceId: workspace.id } })
    ).resolves.toBe(4);
  });

  it("przywraca dane początkowe, zachowuje konto/workspace/katalog badań i unieważnia sesje, bez wpływu na inne workspace'y", async () => {
    await seedDatabase(prisma);
    await provisionWorkshopWorkspaces(prisma, 2);

    const otherWorkspace = await createStaffUser(prisma, {
      workspaceSlug: "klinika-inna",
      workspaceName: "Klinika Inna",
      login: "staff.inna",
      password: "HasloTestowe123!"
    });
    await createTestPatient(prisma, {
      workspaceId: otherWorkspace.workspace.id,
      firstName: "Nie",
      lastName: "Ruszaj",
      pesel: "44051401458",
      birthDate: "1944-05-14",
      gender: "MALE"
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "tester01", password: "WarsztatTestowe123!" }
    });
    expect(loginResponse.statusCode).toBe(200);
    const { token } = JSON.parse(loginResponse.body);

    const workspace01 = await prisma.workspace.findUniqueOrThrow({
      where: { slug: "warsztat-01" }
    });
    const initialPatientCount = await prisma.patient.count({
      where: { workspaceId: workspace01.id }
    });

    const extraPatientResponse = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        firstName: "Uczestnik",
        lastName: "Dodany",
        identifierType: "PESEL",
        pesel: "89112302659",
        birthDate: "1989-11-23",
        gender: "MALE",
        phone: "+48123123199"
      }
    });
    expect(extraPatientResponse.statusCode).toBe(201);
    const extraPatient = JSON.parse(extraPatientResponse.body);

    const catalog = await prisma.medicalTest.findMany({
      orderBy: { code: "asc" }
    });
    const crp = catalog.find((test) => test.code === "CRP")!;

    const orderResponse = await app.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        patientId: extraPatient.id,
        priority: "ROUTINE",
        tests: [{ medicalTestId: crp.id }]
      }
    });
    expect(orderResponse.statusCode).toBe(201);
    const order = JSON.parse(orderResponse.body);

    await expect(prisma.orderHistory.count({ where: { orderId: order.id } })).resolves.toBeGreaterThan(0);

    const result = await resetWorkshopWorkspaces(prisma, { confirm: true });
    expect(result.resetWorkspaceSlugs.sort()).toEqual(["warsztat-01", "warsztat-02"]);

    // 1) dane uczestnika zniknęły
    await expect(
      prisma.patient.findUnique({ where: { id: extraPatient.id } })
    ).resolves.toBeNull();
    await expect(prisma.order.findUnique({ where: { id: order.id } })).resolves.toBeNull();

    // 2) dane początkowe zostały odtworzone
    await expect(
      prisma.patient.count({ where: { workspaceId: workspace01.id } })
    ).resolves.toBe(initialPatientCount);

    // 3) konto i workspace nadal istnieją
    const userAfter = await prisma.user.findUniqueOrThrow({
      where: { login: "tester01" }
    });
    expect(userAfter.active).toBe(true);
    await expect(
      prisma.workspace.findUniqueOrThrow({ where: { slug: "warsztat-01" } })
    ).resolves.toMatchObject({ id: workspace01.id });

    // 4) katalog badań pozostał
    await expect(prisma.medicalTest.count()).resolves.toBe(catalog.length);

    // 5) klinika-pokazowa i niezwiązany workspace nie zostały zmienione
    await expect(
      prisma.user.findUniqueOrThrow({ where: { login: "staff.demo" } })
    ).resolves.toMatchObject({ active: true });
    await expect(
      prisma.patient.count({ where: { workspaceId: otherWorkspace.workspace.id } })
    ).resolves.toBe(1);

    // sesje: aktywna sesja tester01 zostaje unieważniona
    const afterResetResponse = await app.inject({
      method: "GET",
      url: "/api/v1/patients",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(afterResetResponse.statusCode).toBe(401);
    expect(JSON.parse(afterResetResponse.body).error.code).toBe("SESSION_EXPIRED");

    // można zalogować się ponownie
    const reloginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "tester01", password: "WarsztatTestowe123!" }
    });
    expect(reloginResponse.statusCode).toBe(200);
  });

  it("jest idempotentny: ponowny reset nie usuwa danych początkowych ani nie rzuca błędu", async () => {
    await provisionWorkshopWorkspaces(prisma, 1);

    await resetWorkshopWorkspaces(prisma, { confirm: true });
    const result = await resetWorkshopWorkspaces(prisma, { confirm: true });

    expect(result.resetWorkspaceSlugs).toEqual(["warsztat-01"]);
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { slug: "warsztat-01" }
    });
    await expect(
      prisma.patient.count({ where: { workspaceId: workspace.id } })
    ).resolves.toBe(4);
  });
});
