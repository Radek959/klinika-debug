import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { closeTestApp, createTestApp } from "./test-app";
import {
  configureTestEnvironment,
  createStaffUser,
  createTestPatient,
  resetTestDatabase
} from "./database";

describe("patients read api", () => {
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

  it("zwraca listę pacjentów z paginacją i stabilnym sortowaniem", async () => {
    const { token, workspaceId } = await authenticateWorkspace("staff.a");
    await createTestPatient(prisma, {
      workspaceId,
      firstName: "Anna",
      lastName: "Kowalska",
      pesel: "02270803624",
      birthDate: "2002-07-08",
      gender: "FEMALE"
    });
    await createTestPatient(prisma, {
      workspaceId,
      firstName: "Jan",
      lastName: "Nowak",
      pesel: "44051401458",
      birthDate: "1944-05-14",
      gender: "MALE"
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/patients?page=1&pageSize=1&sort=lastName&order=asc",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(1);
    expect(body.total).toBe(2);
    expect(body.totalPages).toBe(2);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      firstName: "Anna",
      lastName: "Kowalska",
      birthDate: "2002-07-08",
      gender: "FEMALE"
    });
  });

  it("wyszukuje, filtruje i sortuje pacjentów po stronie API", async () => {
    const { token, workspaceId } = await authenticateWorkspace("staff.a");
    await createTestPatient(prisma, {
      workspaceId,
      firstName: "Maja",
      lastName: "Syntetyczna",
      pesel: "18210112349",
      birthDate: "2018-01-01",
      gender: "FEMALE",
      active: true
    });
    await createTestPatient(prisma, {
      workspaceId,
      firstName: "Alex",
      lastName: "Demo",
      identifierType: "OTHER_DOCUMENT",
      documentType: "PASSPORT",
      documentNumber: "XD1234567",
      documentCountry: "CZ",
      birthDate: "1988-03-12",
      gender: "MALE",
      active: false
    });
    await createTestPatient(prisma, {
      workspaceId,
      firstName: "Jan",
      lastName: "Nowak",
      pesel: "44051401458",
      birthDate: "1944-05-14",
      gender: "MALE",
      active: true
    });

    const byDocument = await app.inject({
      method: "GET",
      url: "/api/v1/patients?search=XD123&identifierType=OTHER_DOCUMENT&active=false",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(byDocument.statusCode).toBe(200);
    expect(JSON.parse(byDocument.body).items).toEqual([
      expect.objectContaining({
        firstName: "Alex",
        identifierType: "OTHER_DOCUMENT",
        documentNumber: "XD1234567",
        active: false
      })
    ]);

    const sortedByBirthDate = await app.inject({
      method: "GET",
      url: "/api/v1/patients?sort=birthDate&order=desc",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(sortedByBirthDate.statusCode).toBe(200);
    expect(JSON.parse(sortedByBirthDate.body).items.map((item: { firstName: string }) => item.firstName)).toEqual([
      "Maja",
      "Alex",
      "Jan"
    ]);
  });

  it("zwraca szczegóły pacjenta z opiekunem i datą urodzenia jako YYYY-MM-DD", async () => {
    const { token, workspaceId } = await authenticateWorkspace("staff.a");
    const patient = await createTestPatient(prisma, {
      workspaceId,
      firstName: "Maja",
      lastName: "Syntetyczna",
      pesel: "18210112349",
      birthDate: "2018-01-01",
      gender: "FEMALE"
    });
    await prisma.guardian.create({
      data: {
        workspaceId,
        patientId: patient.id,
        firstName: "Karolina",
        lastName: "Syntetyczna",
        phone: "+48123123126",
        email: "karolina.syntetyczna@example.test"
      }
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/patients/${patient.id}`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      id: patient.id,
      firstName: "Maja",
      birthDate: "2018-01-01",
      guardian: {
        firstName: "Karolina",
        phone: "+48123123126"
      }
    });
  });

  it("nie zwraca pacjentów z innego workspace’u", async () => {
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
    await createTestPatient(prisma, {
      workspaceId: workspaceA.workspace.id,
      firstName: "Jan",
      lastName: "Własny",
      pesel: "44051401458",
      birthDate: "1944-05-14",
      gender: "MALE"
    });
    const otherPatient = await createTestPatient(prisma, {
      workspaceId: workspaceB.workspace.id,
      firstName: "Anna",
      lastName: "Obca",
      pesel: "02270803624",
      birthDate: "2002-07-08",
      gender: "FEMALE"
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "staff.a", password }
    });
    const token = JSON.parse(loginResponse.body).token;

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/patients?search=Obca",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(listResponse.statusCode).toBe(200);
    expect(JSON.parse(listResponse.body).items).toEqual([]);

    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/v1/patients/${otherPatient.id}`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(detailResponse.statusCode).toBe(404);
    expect(JSON.parse(detailResponse.body).error.code).toBe("PATIENT_NOT_FOUND");
  });

  async function authenticateWorkspace(login: string) {
    const password = "HasloTestowe123!";
    const { workspace } = await createStaffUser(prisma, {
      workspaceSlug: login.replace(".", "-"),
      workspaceName: `Klinika ${login}`,
      login,
      password
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login, password }
    });
    expect(loginResponse.statusCode).toBe(200);

    return {
      token: JSON.parse(loginResponse.body).token as string,
      workspaceId: workspace.id
    };
  }
});
