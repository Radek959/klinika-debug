import request from "supertest";
import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { closeTestApp, createTestApp } from "./test-app";
import {
  configureTestEnvironment,
  createStaffUser,
  resetTestDatabase
} from "./database";

describe("workspace isolation", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    configureTestEnvironment();
    prisma = new PrismaClient();
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
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

    const patientA = await prisma.patient.create({
      data: {
        workspaceId: workspaceA.workspace.id,
        firstName: "Jan",
        lastName: "Testowy",
        identifierType: "PESEL",
        pesel: "44051401458"
      }
    });
    const patientB = await prisma.patient.create({
      data: {
        workspaceId: workspaceB.workspace.id,
        firstName: "Anna",
        lastName: "Syntetyczna",
        identifierType: "PESEL",
        pesel: "02270803628"
      }
    });

    const loginResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ login: "staff.a", password })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientA.id}`)
      .set("Authorization", `Bearer ${loginResponse.body.token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.id).toBe(patientA.id);
      });

    await request(app.getHttpServer())
      .get(`/api/v1/patients/${patientB.id}`)
      .set("Authorization", `Bearer ${loginResponse.body.token}`)
      .expect(404)
      .expect(({ body }) => {
        expect(body.error.code).toBe("PATIENT_NOT_FOUND");
      });
  });
});
