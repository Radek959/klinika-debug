import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { closeTestApp, createTestApp } from "./test-app";
import {
  configureTestEnvironment,
  createStaffUser,
  createTestOrder,
  createTestPatient,
  resetTestDatabase
} from "./database";

describe("GET /api/v1/dashboard/summary", () => {
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

  const emptyByStatus = {
    DRAFT: 0,
    SAMPLE_COLLECTION_IN_PROGRESS: 0,
    SAMPLE_COLLECTED: 0,
    SENT_TO_LAB: 0,
    PROCESSING: 0,
    PARTIAL: 0,
    COMPLETED: 0,
    REJECTED: 0,
    TECHNICAL_ERROR: 0
  };

  it("odrzuca brak tokenu", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary"
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("zwraca same zera bez żadnych danych", async () => {
    const password = "HasloTestowe123!";
    await createStaffUser(prisma, {
      workspaceSlug: "klinika-puste",
      workspaceName: "Klinika Pusta",
      login: "staff.puste",
      password
    });

    const token = await login("staff.puste", password);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      patients: { total: 0, active: 0, inactive: 0 },
      orders: { total: 0, byStatus: emptyByStatus }
    });
  });

  it("poprawnie liczy aktywnych i nieaktywnych pacjentów", async () => {
    const password = "HasloTestowe123!";
    const { workspace } = await createStaffUser(prisma, {
      workspaceSlug: "klinika-pacjenci",
      workspaceName: "Klinika Pacjenci",
      login: "staff.pacjenci",
      password
    });

    await createTestPatient(prisma, {
      workspaceId: workspace.id,
      firstName: "Jan",
      lastName: "Aktywny",
      pesel: "44051401458",
      birthDate: "1944-05-14",
      gender: "MALE",
      active: true
    });
    await createTestPatient(prisma, {
      workspaceId: workspace.id,
      firstName: "Anna",
      lastName: "Aktywna",
      pesel: "02270803624",
      birthDate: "2002-07-08",
      gender: "FEMALE",
      active: true
    });
    await createTestPatient(prisma, {
      workspaceId: workspace.id,
      firstName: "Ewa",
      lastName: "Nieaktywna",
      pesel: "68120902460",
      birthDate: "1968-12-09",
      gender: "FEMALE",
      active: false
    });

    const token = await login("staff.pacjenci", password);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.patients).toEqual({ total: 3, active: 2, inactive: 1 });
  });

  it("poprawnie liczy zlecenia w podziale na status i zwraca wszystkie statusy", async () => {
    const password = "HasloTestowe123!";
    const { workspace, user } = await createStaffUser(prisma, {
      workspaceSlug: "klinika-zlecenia",
      workspaceName: "Klinika Zlecenia",
      login: "staff.zlecenia",
      password
    });

    const patient = await createTestPatient(prisma, {
      workspaceId: workspace.id,
      firstName: "Jan",
      lastName: "Testowy",
      pesel: "44051401458",
      birthDate: "1944-05-14",
      gender: "MALE"
    });

    await createTestOrder(prisma, {
      workspaceId: workspace.id,
      patientId: patient.id,
      createdByUserId: user.id,
      status: "DRAFT"
    });
    await createTestOrder(prisma, {
      workspaceId: workspace.id,
      patientId: patient.id,
      createdByUserId: user.id,
      status: "SENT_TO_LAB"
    });
    await createTestOrder(prisma, {
      workspaceId: workspace.id,
      patientId: patient.id,
      createdByUserId: user.id,
      status: "COMPLETED"
    });
    await createTestOrder(prisma, {
      workspaceId: workspace.id,
      patientId: patient.id,
      createdByUserId: user.id,
      status: "COMPLETED"
    });

    const token = await login("staff.zlecenia", password);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.orders).toEqual({
      total: 4,
      byStatus: {
        ...emptyByStatus,
        DRAFT: 1,
        SENT_TO_LAB: 1,
        COMPLETED: 2
      }
    });
    expect(Object.keys(body.orders.byStatus)).toEqual(Object.keys(emptyByStatus));
    const sumByStatus = Object.values(body.orders.byStatus as Record<string, number>).reduce(
      (sum, count) => sum + count,
      0
    );
    expect(sumByStatus).toBe(body.orders.total);
  });

  it("liczy wyłącznie dane workspace’u zalogowanego użytkownika", async () => {
    const password = "HasloTestowe123!";
    const workspaceA = await createStaffUser(prisma, {
      workspaceSlug: "warsztat-01",
      workspaceName: "Warsztat 01",
      login: "tester01",
      password
    });
    const workspaceB = await createStaffUser(prisma, {
      workspaceSlug: "klinika-pokazowa",
      workspaceName: "Klinika Pokazowa",
      login: "tester.pokazowa",
      password
    });

    const patientA = await createTestPatient(prisma, {
      workspaceId: workspaceA.workspace.id,
      firstName: "Jan",
      lastName: "WorkspaceA",
      pesel: "44051401458",
      birthDate: "1944-05-14",
      gender: "MALE"
    });
    await createTestOrder(prisma, {
      workspaceId: workspaceA.workspace.id,
      patientId: patientA.id,
      createdByUserId: workspaceA.user.id,
      status: "DRAFT"
    });

    const patientB1 = await createTestPatient(prisma, {
      workspaceId: workspaceB.workspace.id,
      firstName: "Anna",
      lastName: "WorkspaceB",
      pesel: "02270803624",
      birthDate: "2002-07-08",
      gender: "FEMALE"
    });
    const patientB2 = await createTestPatient(prisma, {
      workspaceId: workspaceB.workspace.id,
      firstName: "Ewa",
      lastName: "WorkspaceB",
      pesel: "68120902460",
      birthDate: "1968-12-09",
      gender: "FEMALE",
      active: false
    });
    await createTestOrder(prisma, {
      workspaceId: workspaceB.workspace.id,
      patientId: patientB1.id,
      createdByUserId: workspaceB.user.id,
      status: "COMPLETED"
    });
    await createTestOrder(prisma, {
      workspaceId: workspaceB.workspace.id,
      patientId: patientB2.id,
      createdByUserId: workspaceB.user.id,
      status: "COMPLETED"
    });
    await createTestOrder(prisma, {
      workspaceId: workspaceB.workspace.id,
      patientId: patientB2.id,
      createdByUserId: workspaceB.user.id,
      status: "REJECTED"
    });

    const tokenA = await login("tester01", password);
    const tokenB = await login("tester.pokazowa", password);

    const responseA = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary",
      headers: { authorization: `Bearer ${tokenA}` }
    });
    const responseB = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/summary",
      headers: { authorization: `Bearer ${tokenB}` }
    });

    expect(responseA.statusCode).toBe(200);
    expect(responseB.statusCode).toBe(200);

    const bodyA = JSON.parse(responseA.body);
    const bodyB = JSON.parse(responseB.body);

    expect(bodyA).toEqual({
      patients: { total: 1, active: 1, inactive: 0 },
      orders: { total: 1, byStatus: { ...emptyByStatus, DRAFT: 1 } }
    });
    expect(bodyB).toEqual({
      patients: { total: 2, active: 1, inactive: 1 },
      orders: {
        total: 3,
        byStatus: { ...emptyByStatus, COMPLETED: 2, REJECTED: 1 }
      }
    });
    expect(bodyA).not.toEqual(bodyB);
  });

  async function login(loginName: string, password: string): Promise<string> {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: loginName, password }
    });
    expect(loginResponse.statusCode).toBe(200);
    return JSON.parse(loginResponse.body).token;
  }
});
