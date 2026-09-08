import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { provisionWorkshopWorkspaces } from "../src/common/prisma/seed-workshop";
import { closeTestApp, createTestApp } from "./test-app";
import { configureTestEnvironment, resetTestDatabase } from "./database";

describe("workshop workspace isolation", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  const originalWorkshopPassword = process.env.WORKSHOP_STAFF_PASSWORD;

  beforeAll(async () => {
    configureTestEnvironment();
    process.env.WORKSHOP_STAFF_PASSWORD = "WarsztatTestowe123!";
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    await provisionWorkshopWorkspaces(prisma, 2);
  });

  afterAll(async () => {
    if (originalWorkshopPassword === undefined) {
      delete process.env.WORKSHOP_STAFF_PASSWORD;
    } else {
      process.env.WORKSHOP_STAFF_PASSWORD = originalWorkshopPassword;
    }
    await closeTestApp(app);
  });

  it("tester01 nie widzi pacjentów tester02 na liście", async () => {
    const tester01 = await login("tester01");
    const tester02 = await login("tester02");

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/patients",
      headers: { authorization: `Bearer ${tester01.token}` }
    });

    expect(listResponse.statusCode).toBe(200);
    const body = JSON.parse(listResponse.body);
    const patientIds = body.items.map((patient: { id: string }) => patient.id);

    const tester02Patients = await prisma.patient.findMany({
      where: { workspaceId: tester02.workspaceId }
    });
    for (const patient of tester02Patients) {
      expect(patientIds).not.toContain(patient.id);
    }
  });

  it("bezpośrednie użycie ID pacjenta z innego workspace'u zwraca 404, a nie ujawnia jego istnienia", async () => {
    const tester01 = await login("tester01");
    const tester02 = await login("tester02");

    const foreignPatient = await prisma.patient.findFirstOrThrow({
      where: { workspaceId: tester02.workspaceId }
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/patients/${foreignPatient.id}`,
      headers: { authorization: `Bearer ${tester01.token}` }
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error.code).toBe("PATIENT_NOT_FOUND");
  });

  it("tester01 nie może zmodyfikować pacjenta tester02 przez jego ID", async () => {
    const tester01 = await login("tester01");
    const tester02 = await login("tester02");

    const foreignPatient = await prisma.patient.findFirstOrThrow({
      where: { workspaceId: tester02.workspaceId }
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${foreignPatient.id}`,
      headers: { authorization: `Bearer ${tester01.token}` },
      payload: { lastName: "Zmieniony" }
    });

    expect(response.statusCode).toBe(404);

    const unchanged = await prisma.patient.findUniqueOrThrow({
      where: { id: foreignPatient.id }
    });
    expect(unchanged.lastName).toBe(foreignPatient.lastName);
  });

  async function login(login: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login, password: "WarsztatTestowe123!" }
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    return {
      token: body.token as string,
      workspaceId: body.user.workspace.id as string
    };
  }
});
