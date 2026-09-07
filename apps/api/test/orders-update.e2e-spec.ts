import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { seedDatabase } from "../src/common/prisma/seed-database";
import { closeTestApp, createTestApp } from "./test-app";
import {
  configureTestEnvironment,
  createStaffUser,
  createTestPatient,
  resetTestDatabase
} from "./database";

describe("orders update api", () => {
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
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it("odrzuca brak tokenu", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/orders/${order.id}`,
      payload: { priority: "URGENT" }
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("zmienia sam priorytet i nie wymaga aktywności obecnego pacjenta", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    await prisma.patient.update({ where: { id: patientId }, data: { active: false } });

    const response = await updateOrder(token, order.id, { priority: "URGENT" });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      patientId,
      priority: "URGENT",
      status: "DRAFT"
    });
    expect(body.tests).toHaveLength(1);
    expect(body.samples).toHaveLength(1);
  });

  it("zmienia pacjenta tylko w bieżącym workspace", async () => {
    const { token, workspaceId, patientId, tests } = await setupDefaultOrderData();
    const newPatient = await createTestPatient(prisma, {
      workspaceId,
      firstName: "Jan",
      lastName: "Nowy",
      identifierType: "OTHER_DOCUMENT",
      documentType: "PASSPORT",
      documentNumber: "NOWY-1",
      documentCountry: "PL",
      birthDate: "1988-01-01",
      gender: "MALE"
    });
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const response = await updateOrder(token, order.id, { patientId: newPatient.id });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).patientId).toBe(newPatient.id);
    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({
      patientId: newPatient.id,
      workspaceId
    });
  });

  it("zastępuje badania, dodaje i usuwa materiały oraz zachowuje próbkę nadal potrzebną", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }, { medicalTestId: tests.TSH.id }]
    });
    const originalSerumSampleId = order.samples[0].id;

    const response = await updateOrder(token, order.id, {
      tests: [
        { medicalTestId: tests.TSH.id },
        { medicalTestId: tests.MORF.id },
        { medicalTestId: tests.URINE.id }
      ]
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.tests.map((test: { code: string }) => test.code)).toEqual([
      "MORF",
      "TSH",
      "URINE"
    ]);
    expect(body.samples.map((sample: { materialType: string }) => sample.materialType)).toEqual([
      "EDTA_BLOOD",
      "SERUM",
      "URINE"
    ]);
    expect(body.samples.find((sample: { materialType: string }) => sample.materialType === "SERUM").id).toBe(originalSerumSampleId);
  });

  it("usuwa niepotrzebny materiał po zmianie listy badań", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }, { medicalTestId: tests.URINE.id }]
    });

    const response = await updateOrder(token, order.id, {
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).samples.map((sample: { materialType: string }) => sample.materialType)).toEqual([
      "SERUM"
    ]);
    await expect(prisma.sample.count({ where: { orderId: order.id } })).resolves.toBe(1);
  });

  it("aktualizuje dane dodatkowe i zachowuje false", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [
        { medicalTestId: tests.GLU.id, additionalData: { PATIENT_PREPARED: true } }
      ]
    });

    const response = await updateOrder(token, order.id, {
      tests: [
        { medicalTestId: tests.GLU.id, additionalData: { PATIENT_PREPARED: false } }
      ]
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).tests[0].additionalData).toEqual({
      PATIENT_PREPARED: false
    });
    await expect(prisma.orderTest.findFirstOrThrow({ where: { orderId: order.id } })).resolves.toMatchObject({
      additionalData: { PATIENT_PREPARED: false }
    });
  });

  it("odrzuca pusty PATCH i request bez rzeczywistej zmiany", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const empty = await updateOrder(token, order.id, {});
    expect(empty.statusCode).toBe(400);
    expect(JSON.parse(empty.body).error.fieldErrors).toContainEqual(
      expect.objectContaining({ field: "body", code: "EMPTY_PATCH" })
    );

    const unchanged = await updateOrder(token, order.id, { priority: "ROUTINE" });
    expect(unchanged.statusCode).toBe(422);
    expect(JSON.parse(unchanged.body).error.fieldErrors).toContainEqual(
      expect.objectContaining({ field: "body", code: "NO_CHANGES" })
    );
  });

  it("odrzuca nieznane pola i brak badań", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    const unknown = await updateOrder(token, order.id, { status: "COMPLETED" });
    expect(unknown.statusCode).toBe(400);
    expect(JSON.parse(unknown.body).error.fieldErrors).toContainEqual(
      expect.objectContaining({ field: "status", code: "UNKNOWN_FIELD" })
    );

    const noTests = await updateOrder(token, order.id, { tests: [] });
    expectOrderUpdateValidation(noTests, "tests", "TESTS_REQUIRED");
  });

  it("odrzuca duplikaty, nieistniejące, nieaktywne i źle uzupełnione badania bez częściowego zapisu", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    expectOrderUpdateValidation(
      await updateOrder(token, order.id, {
        tests: [{ medicalTestId: tests.CRP.id }, { medicalTestId: tests.CRP.id }]
      }),
      "tests.1.medicalTestId",
      "DUPLICATE_TEST"
    );
    expectOrderUpdateValidation(
      await updateOrder(token, order.id, { tests: [{ medicalTestId: "missing" }] }),
      "tests.0.medicalTestId",
      "MEDICAL_TEST_NOT_FOUND"
    );
    await prisma.medicalTest.update({ where: { id: tests.TSH.id }, data: { active: false } });
    expectOrderUpdateValidation(
      await updateOrder(token, order.id, { tests: [{ medicalTestId: tests.TSH.id }] }),
      "tests.0.medicalTestId",
      "MEDICAL_TEST_INACTIVE"
    );
    expectOrderUpdateValidation(
      await updateOrder(token, order.id, {
        tests: [{ medicalTestId: tests.GLU.id, additionalData: {} }]
      }),
      "tests.0.additionalData.PATIENT_PREPARED",
      "REQUIRED_ADDITIONAL_DATA"
    );
    expectOrderUpdateValidation(
      await updateOrder(token, order.id, {
        tests: [{ medicalTestId: tests.CRP.id, additionalData: { UNKNOWN: true } }]
      }),
      "tests.0.additionalData.UNKNOWN",
      "UNKNOWN_ADDITIONAL_DATA_FIELD"
    );

    const persisted = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { tests: true, samples: true }
    });
    expect(persisted.tests).toHaveLength(1);
    expect(persisted.tests[0].medicalTestId).toBe(tests.CRP.id);
    expect(persisted.samples).toHaveLength(1);
  });

  it("zwraca 404 dla zlecenia i pacjenta spoza workspace'u", async () => {
    const workspaceA = await setupDefaultOrderData();
    const order = await createOrderAndParse(workspaceA.token, {
      patientId: workspaceA.patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: workspaceA.tests.CRP.id }]
    });
    const { workspace, user } = await createStaffUser(prisma, {
      workspaceSlug: "obca-klinika",
      workspaceName: "Obca Klinika",
      login: "staff.obcy",
      password: "HasloTestowe123!"
    });
    const otherPatient = await createTestPatient(prisma, {
      workspaceId: workspace.id,
      firstName: "Olga",
      lastName: "Obca",
      pesel: "02270803624",
      birthDate: "2002-07-08",
      gender: "FEMALE"
    });
    const otherLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: user.login, password: "HasloTestowe123!" }
    });
    const otherToken = JSON.parse(otherLogin.body).token as string;

    expect((await updateOrder(otherToken, order.id, { priority: "URGENT" })).statusCode).toBe(404);
    const patientResponse = await updateOrder(workspaceA.token, order.id, {
      patientId: otherPatient.id
    });
    expect(patientResponse.statusCode).toBe(404);
    expect(JSON.parse(patientResponse.body).error.code).toBe("PATIENT_NOT_FOUND");
  });

  it("odrzuca nieaktywnego pacjenta przy zmianie pacjenta", async () => {
    const { token, workspaceId, patientId, tests } = await setupDefaultOrderData();
    const inactive = await createTestPatient(prisma, {
      workspaceId,
      firstName: "Jan",
      lastName: "Nieaktywny",
      identifierType: "OTHER_DOCUMENT",
      documentType: "PASSPORT",
      documentNumber: "INACTIVE-2",
      documentCountry: "PL",
      birthDate: "1988-03-12",
      gender: "MALE",
      active: false
    });
    const order = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    expectOrderUpdateValidation(
      await updateOrder(token, order.id, { patientId: inactive.id }),
      "patientId",
      "PATIENT_INACTIVE"
    );
  });

  it("odrzuca edycję po pobraniu próbki i po wysłaniu do laboratorium", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();
    const inProgress = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.MORF.id }, { medicalTestId: tests.CRP.id }]
    });
    await registerSample(token, inProgress.id, {
      materialType: "EDTA_BLOOD",
      barcode: "SMP-EDIT-1",
      collectedAt: new Date().toISOString()
    });

    expectOrderUpdateValidation(
      await updateOrder(token, inProgress.id, { priority: "URGENT" }),
      "status",
      "ORDER_NOT_EDITABLE"
    );

    const sent = await createOrderAndParse(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });
    await registerSample(token, sent.id, {
      materialType: "SERUM",
      barcode: "SMP-EDIT-2",
      collectedAt: new Date().toISOString()
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/orders/${sent.id}/send`,
      headers: { authorization: `Bearer ${token}` }
    });

    expectOrderUpdateValidation(
      await updateOrder(token, sent.id, { priority: "URGENT" }),
      "status",
      "ORDER_NOT_EDITABLE"
    );
  });

  it("publikuje PATCH /api/v1/orders/{orderId} w OpenAPI", async () => {
    const response = await app.inject({ method: "GET", url: "/api/docs-json" });

    expect(response.statusCode).toBe(200);
    const document = JSON.parse(response.body);
    const patch = document.paths["/api/v1/orders/{orderId}"].patch;
    expect(patch.summary).toBe("Edycja wersji roboczej zlecenia");
    expect(patch.description).toContain("statusie DRAFT");
    expect(patch.description).toContain("tests oznacza kompletną docelową listę");
    expect(patch.responses).toHaveProperty("400");
    expect(patch.responses).toHaveProperty("401");
    expect(patch.responses).toHaveProperty("404");
    expect(patch.responses).toHaveProperty("422");
  });

  async function setupDefaultOrderData() {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "staff.demo", password: "SeedTestowe123!" }
    });
    expect(loginResponse.statusCode).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { login: "staff.demo" } });
    const patient = await prisma.patient.findFirstOrThrow({
      where: { workspaceId: user.workspaceId, active: true }
    });
    const catalog = await prisma.medicalTest.findMany({ orderBy: { code: "asc" } });
    const tests = Object.fromEntries(catalog.map((test) => [test.code, test]));

    return {
      token: JSON.parse(loginResponse.body).token as string,
      workspaceId: user.workspaceId,
      patientId: patient.id,
      tests: tests as Record<string, { id: string }>
    };
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

  async function updateOrder(token: string, orderId: string, payload: Record<string, unknown>) {
    return app.inject({
      method: "PATCH",
      url: `/api/v1/orders/${orderId}`,
      headers: { authorization: `Bearer ${token}` },
      payload
    });
  }

  async function registerSample(token: string, orderId: string, payload: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: `/api/v1/orders/${orderId}/samples`,
      headers: { authorization: `Bearer ${token}` },
      payload
    });
  }
});

function expectOrderUpdateValidation(
  response: { statusCode: number; body: string },
  field: string,
  code: string
) {
  expect(response.statusCode).toBe(422);
  expect(JSON.parse(response.body)).toMatchObject({
    error: {
      code: "ORDER_UPDATE_ERROR",
      fieldErrors: expect.arrayContaining([
        expect.objectContaining({ field, code })
      ])
    }
  });
}
