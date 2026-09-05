import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { closeTestApp, createTestApp } from "./test-app";
import {
  configureTestEnvironment,
  createTestPatient,
  createStaffUser,
  resetTestDatabase
} from "./database";

describe("workspace isolation", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    configureTestEnvironment();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it("traktuje pacjenta z innego workspace’u jak nieistniejący zasób", async () => {
    const password = "HasloTestowe123!";
    const workspaceA = await createStaffUser(prisma, {
      workspaceSlug: "klinika-a",
      workspaceName: "Klinika A",
      login: "staff.a",
      password
    });
    const workspaceB = await createStaffUser(prisma, {
      workspaceSlug: "klinika-b",
      workspaceName: "Klinika B",
      login: "staff.b",
      password
    });

    const patientA = await createTestPatient(prisma, {
      workspaceId: workspaceA.workspace.id,
      firstName: "Jan",
      lastName: "Testowy",
      pesel: "44051401458",
      birthDate: "1944-05-14",
      gender: "MALE"
    });
    const patientB = await createTestPatient(prisma, {
      workspaceId: workspaceB.workspace.id,
      firstName: "Anna",
      lastName: "Syntetyczna",
      pesel: "02270803624",
      birthDate: "2002-07-08",
      gender: "FEMALE"
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "staff.a", password }
    });
    expect(loginResponse.statusCode).toBe(200);
    const loginBody = JSON.parse(loginResponse.body);

    const ownPatientResponse = await app.inject({
      method: "GET",
      url: `/api/v1/patients/${patientA.id}`,
      headers: { authorization: `Bearer ${loginBody.token}` }
    });
    expect(ownPatientResponse.statusCode).toBe(200);
    expect(JSON.parse(ownPatientResponse.body).id).toBe(patientA.id);

    const otherWorkspacePatientResponse = await app.inject({
      method: "GET",
      url: `/api/v1/patients/${patientB.id}`,
      headers: { authorization: `Bearer ${loginBody.token}` }
    });
    expect(otherWorkspacePatientResponse.statusCode).toBe(404);
    expect(JSON.parse(otherWorkspacePatientResponse.body).error.code).toBe(
      "PATIENT_NOT_FOUND"
    );
  });
});
