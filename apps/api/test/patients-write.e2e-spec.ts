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

describe("patients write api", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    configureTestEnvironment();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it("tworzy pacjenta z PESEL-em i nie przyjmuje workspaceId z payloadu", async () => {
    const { token, workspaceId } = await authenticateWorkspace("staff.a");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        workspaceId: "obcy-workspace",
        firstName: "  Łukasz  ",
        lastName: "Nowak-Testowy",
        identifierType: "PESEL",
        pesel: "44051401458",
        birthDate: "1944-05-14",
        gender: "MALE",
        phone: "+48123123123"
      }
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      firstName: "Łukasz",
      lastName: "Nowak-Testowy",
      identifierType: "PESEL",
      pesel: "44051401458",
      documentType: null,
      documentNumber: null,
      documentCountry: null,
      birthDate: "1944-05-14",
      gender: "MALE",
      active: true
    });
    expect(body.workspaceId).toBeUndefined();

    const patient = await prisma.patient.findUniqueOrThrow({
      where: { id: body.id }
    });
    expect(patient.workspaceId).toBe(workspaceId);
  });

  it("tworzy pacjenta z innym dokumentem", async () => {
    const { token } = await authenticateWorkspace("staff.a");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { authorization: `Bearer ${token}` },
      payload: otherDocumentPayload()
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toMatchObject({
      firstName: "Alex",
      identifierType: "OTHER_DOCUMENT",
      pesel: null,
      documentType: "PASSPORT",
      documentNumber: "XD1234567",
      documentCountry: "CZ",
      birthDate: "1988-03-12",
      gender: "MALE"
    });
  });

  it("odrzuca błędny PESEL, niezgodną datę i niezgodną płeć", async () => {
    const { token } = await authenticateWorkspace("staff.a");

    await expectPatientValidation(token, {
      ...peselPayload(),
      pesel: "44051401459"
    }, "pesel", "INVALID_CHECKSUM");

    await expectPatientValidation(token, {
      ...peselPayload(),
      birthDate: "1944-05-15"
    }, "birthDate", "PESEL_BIRTH_DATE_MISMATCH");

    await expectPatientValidation(token, {
      ...peselPayload(),
      gender: "FEMALE"
    }, "gender", "PESEL_GENDER_MISMATCH");
  });

  it("odrzuca brak kontaktu i brak danych kontaktowych opiekuna", async () => {
    const { token } = await authenticateWorkspace("staff.a");

    await expectPatientValidation(token, {
      ...peselPayload(),
      phone: null,
      email: null
    }, "contact", "CONTACT_REQUIRED");

    await expectPatientValidation(token, {
      firstName: "Maja",
      lastName: "Syntetyczna",
      identifierType: "PESEL",
      pesel: "18210112349",
      birthDate: "2018-01-01",
      gender: "FEMALE",
      phone: "123456789",
      guardian: {
        firstName: "Karolina",
        lastName: "Syntetyczna"
      }
    }, "guardian.contact", "GUARDIAN_CONTACT_REQUIRED");
  });

  it("wymaga opiekuna dla pacjenta niepełnoletniego", async () => {
    const { token } = await authenticateWorkspace("staff.a");

    await expectPatientValidation(token, {
      firstName: "Maja",
      lastName: "Syntetyczna",
      identifierType: "PESEL",
      pesel: "18210112349",
      birthDate: "2018-01-01",
      gender: "FEMALE",
      phone: "123456789"
    }, "guardian", "GUARDIAN_REQUIRED");
  });

  it("wykrywa duplikaty PESEL-u tylko w obrębie workspace’u", async () => {
    const workspaceA = await authenticateWorkspace("staff.a");
    const workspaceB = await authenticateWorkspace("staff.b");

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { authorization: `Bearer ${workspaceA.token}` },
      payload: peselPayload()
    });
    expect(first.statusCode).toBe(201);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { authorization: `Bearer ${workspaceA.token}` },
      payload: { ...peselPayload(), firstName: "Jan" }
    });
    expect(duplicate.statusCode).toBe(409);
    expect(JSON.parse(duplicate.body).error.code).toBe("DUPLICATE_PESEL");

    const otherWorkspace = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { authorization: `Bearer ${workspaceB.token}` },
      payload: peselPayload()
    });
    expect(otherWorkspace.statusCode).toBe(201);
  });

  it("wykrywa duplikaty dokumentu tylko w obrębie workspace’u", async () => {
    const workspaceA = await authenticateWorkspace("staff.a");
    const workspaceB = await authenticateWorkspace("staff.b");

    expect(
      (await app.inject({
        method: "POST",
        url: "/api/v1/patients",
        headers: { authorization: `Bearer ${workspaceA.token}` },
        payload: otherDocumentPayload()
      })).statusCode
    ).toBe(201);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { authorization: `Bearer ${workspaceA.token}` },
      payload: { ...otherDocumentPayload(), firstName: "Alicja" }
    });
    expect(duplicate.statusCode).toBe(409);
    expect(JSON.parse(duplicate.body).error.code).toBe("DUPLICATE_DOCUMENT");

    const otherWorkspace = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { authorization: `Bearer ${workspaceB.token}` },
      payload: otherDocumentPayload()
    });
    expect(otherWorkspace.statusCode).toBe(201);
  });

  it("aktualizuje pacjenta częściowo i dezaktywuje przez PATCH active=false", async () => {
    const { token, workspaceId } = await authenticateWorkspace("staff.a");
    const patient = await createTestPatient(prisma, {
      workspaceId,
      firstName: "Jan",
      lastName: "Testowy",
      pesel: "44051401458",
      birthDate: "1944-05-14",
      gender: "MALE"
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${patient.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        lastName: "Żółć-Kowalski",
        email: "jan.kowalski@example.test",
        active: false
      }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      firstName: "Jan",
      lastName: "Żółć-Kowalski",
      email: "jan.kowalski@example.test",
      active: false
    });
  });

  it("odrzuca próbę reaktywacji i niepoprawną wartość active", async () => {
    const { token, workspaceId } = await authenticateWorkspace("staff.a");
    const patient = await createTestPatient(prisma, {
      workspaceId,
      firstName: "Jan",
      lastName: "Testowy",
      pesel: "44051401458",
      birthDate: "1944-05-14",
      gender: "MALE",
      active: false
    });

    await expectPatientPatchValidation(
      token,
      patient.id,
      { active: true },
      "active",
      "INVALID_ACTIVE_VALUE"
    );

    await expectPatientPatchValidation(
      token,
      patient.id,
      { active: null },
      "active",
      "INVALID_ACTIVE_VALUE"
    );
  });

  it("nie pozwala usunąć opiekuna, jeśli pacjent pozostaje niepełnoletni", async () => {
    const { token } = await authenticateWorkspace("staff.a");
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        firstName: "Maja",
        lastName: "Syntetyczna",
        identifierType: "PESEL",
        pesel: "18210112349",
        birthDate: "2018-01-01",
        gender: "FEMALE",
        phone: "123456789",
        guardian: {
          firstName: "Karolina",
          lastName: "Syntetyczna",
          phone: "123456789"
        }
      }
    });
    expect(createResponse.statusCode).toBe(201);

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${JSON.parse(createResponse.body).id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { guardian: null }
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body)).toMatchObject({
      error: {
        code: "PATIENT_VALIDATION_ERROR",
        fieldErrors: [
          expect.objectContaining({
            field: "guardian",
            code: "GUARDIAN_REQUIRED"
          })
        ]
      }
    });
  });

  it("zmienia rodzaj identyfikatora i czyści poprzednie pola", async () => {
    const { token, workspaceId } = await authenticateWorkspace("staff.a");
    const patient = await createTestPatient(prisma, {
      workspaceId,
      firstName: "Alex",
      lastName: "Demo",
      identifierType: "OTHER_DOCUMENT",
      documentType: "PASSPORT",
      documentNumber: "XD1234567",
      documentCountry: "CZ",
      birthDate: "1988-03-12",
      gender: "MALE"
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${patient.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        identifierType: "PESEL",
        pesel: "02270803624",
        birthDate: "2002-07-08",
        gender: "FEMALE"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      identifierType: "PESEL",
      pesel: "02270803624",
      documentType: null,
      documentNumber: null,
      documentCountry: null
    });
  });

  it("tworzy, aktualizuje i usuwa opiekuna w PATCH", async () => {
    const { token } = await authenticateWorkspace("staff.a");
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        ...peselPayload(),
        pesel: "02270803624",
        birthDate: "2002-07-08",
        gender: "FEMALE"
      }
    });
    const patientId = JSON.parse(createResponse.body).id;

    const createGuardian = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${patientId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        guardian: {
          firstName: "Maria",
          lastName: "Testowa",
          phone: "123456789"
        }
      }
    });
    expect(createGuardian.statusCode).toBe(200);
    expect(JSON.parse(createGuardian.body).guardian).toMatchObject({
      firstName: "Maria",
      phone: "123456789"
    });

    const updateGuardian = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${patientId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        guardian: {
          email: "maria.testowa@example.test"
        }
      }
    });
    expect(updateGuardian.statusCode).toBe(200);
    expect(JSON.parse(updateGuardian.body).guardian).toMatchObject({
      firstName: "Maria",
      lastName: "Testowa",
      phone: "123456789",
      email: "maria.testowa@example.test"
    });

    const removeGuardian = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${patientId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        guardian: null
      }
    });
    expect(removeGuardian.statusCode).toBe(200);
    expect(JSON.parse(removeGuardian.body).guardian).toBeNull();
  });

  it("traktuje edycję pacjenta z obcego workspace’u jak brak zasobu", async () => {
    const workspaceA = await authenticateWorkspace("staff.a");
    const workspaceB = await authenticateWorkspace("staff.b");
    const patient = await createTestPatient(prisma, {
      workspaceId: workspaceB.workspaceId,
      firstName: "Anna",
      lastName: "Obca",
      pesel: "02270803624",
      birthDate: "2002-07-08",
      gender: "FEMALE"
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${patient.id}`,
      headers: { authorization: `Bearer ${workspaceA.token}` },
      payload: { lastName: "Nowa" }
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error.code).toBe("PATIENT_NOT_FOUND");
  });

  it("mapuje konflikt unikalności bazy na kontrolowane 409", async () => {
    const { token } = await authenticateWorkspace("staff.a");
    expect(
      (await app.inject({
        method: "POST",
        url: "/api/v1/patients",
        headers: { authorization: `Bearer ${token}` },
        payload: peselPayload()
      })).statusCode
    ).toBe(201);

    jest
      .spyOn(prisma.patient, "findFirst")
      .mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...peselPayload(), firstName: "Jan" }
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error.code).toBe("DUPLICATE_PESEL");
  });

  it("odrzuca brak tokenu", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      payload: peselPayload()
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  async function expectPatientValidation(
    token: string,
    payload: Record<string, unknown>,
    field: string,
    code: string
  ) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: { authorization: `Bearer ${token}` },
      payload
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body)).toMatchObject({
      error: {
        code: "PATIENT_VALIDATION_ERROR",
        fieldErrors: [expect.objectContaining({ field, code })]
      }
    });
  }

  async function expectPatientPatchValidation(
    token: string,
    patientId: string,
    payload: Record<string, unknown>,
    field: string,
    code: string
  ) {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/patients/${patientId}`,
      headers: { authorization: `Bearer ${token}` },
      payload
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body)).toMatchObject({
      error: {
        code: "PATIENT_VALIDATION_ERROR",
        fieldErrors: [expect.objectContaining({ field, code })]
      }
    });
  }

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

function peselPayload() {
  return {
    firstName: "Łukasz",
    lastName: "Nowak-Testowy",
    identifierType: "PESEL",
    pesel: "44051401458",
    birthDate: "1944-05-14",
    gender: "MALE",
    phone: "+48123123123"
  };
}

function otherDocumentPayload() {
  return {
    firstName: "Alex",
    lastName: "Demo",
    identifierType: "OTHER_DOCUMENT",
    documentType: "PASSPORT",
    documentNumber: "XD1234567",
    documentCountry: "CZ",
    birthDate: "1988-03-12",
    gender: "MALE",
    email: "alex.demo@example.test"
  };
}
