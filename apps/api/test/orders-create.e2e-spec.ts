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

describe("orders create api", () => {
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
    const { patientId, tests } = await setupDefaultOrderData();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders",
      payload: {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      }
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error.code).toBe("AUTHENTICATION_REQUIRED");
    await expectOrderTablesCount(0, 0, 0);
  });

  it("tworzy zlecenie ROUTINE w statusie DRAFT z użytkownikiem z sesji", async () => {
    const { token, userId, patientId, tests } = await setupDefaultOrderData();

    const response = await createOrder(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      patientId,
      priority: "ROUTINE",
      status: "DRAFT",
      createdByUserId: userId,
      externalOrderId: null,
      correlationId: null,
      sentAt: null,
      estimatedCompletionAt: null,
      tests: [
        expect.objectContaining({
          medicalTestId: tests.CRP.id,
          code: "CRP",
          name: "CRP",
          materialType: "SERUM",
          additionalData: null
        })
      ],
      samples: [
        expect.objectContaining({
          materialType: "SERUM",
          status: "REQUIRED",
          barcode: null,
          collectedAt: null,
          collectedByUserId: null,
          rejectionCode: null,
          rejectionReason: null
        })
      ]
    });
    expect(body.workspaceId).toBeUndefined();
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
    expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt);

    const savedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: body.id },
      include: { tests: true, samples: true }
    });
    expect(savedOrder.status).toBe("DRAFT");
    expect(savedOrder.priority).toBe("ROUTINE");
    expect(savedOrder.createdByUserId).toBe(userId);
    expect(savedOrder.tests).toHaveLength(1);
    expect(savedOrder.samples).toHaveLength(1);
  });

  it("tworzy zlecenie URGENT", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();

    const response = await createOrder(token, {
      patientId,
      priority: "URGENT",
      tests: [{ medicalTestId: tests.MORF.id }]
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toMatchObject({
      priority: "URGENT",
      status: "DRAFT",
      samples: [expect.objectContaining({ materialType: "EDTA_BLOOD" })]
    });
  });

  it("tworzy jedną próbkę SERUM dla CRP i TSH", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();

    const response = await createOrder(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }, { medicalTestId: tests.TSH.id }]
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.tests.map((test: { code: string }) => test.code)).toEqual([
      "CRP",
      "TSH"
    ]);
    expect(body.samples.map((sample: { materialType: string }) => sample.materialType)).toEqual([
      "SERUM"
    ]);
    await expectOrderTablesCount(1, 2, 1);
  });

  it("tworzy osobne próbki dla różnych materiałów w deterministycznej kolejności", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();

    const response = await createOrder(token, {
      patientId,
      priority: "ROUTINE",
      tests: [
        { medicalTestId: tests.URINE.id },
        { medicalTestId: tests.CRP.id },
        { medicalTestId: tests.MORF.id }
      ]
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.tests.map((test: { code: string }) => test.code)).toEqual([
      "CRP",
      "MORF",
      "URINE"
    ]);
    expect(body.samples.map((sample: { materialType: string }) => sample.materialType)).toEqual([
      "EDTA_BLOOD",
      "SERUM",
      "URINE"
    ]);
    await expectOrderTablesCount(1, 3, 3);
  });

  it("odrzuca pustą listę badań jako błąd biznesowy", async () => {
    const { token, patientId } = await setupDefaultOrderData();

    const response = await createOrder(token, {
      patientId,
      priority: "ROUTINE",
      tests: []
    });

    expectOrderValidation(response, "tests", "TESTS_REQUIRED");
    await expectOrderTablesCount(0, 0, 0);
  });

  it("zwraca correlationId w body.error i nagłówku odpowiedzi błędu", async () => {
    const { token, patientId } = await setupDefaultOrderData();
    const correlationId = "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7";

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: {
        authorization: `Bearer ${token}`,
        "x-correlation-id": correlationId
      },
      payload: {
        patientId,
        priority: "ROUTINE",
        tests: []
      }
    });

    expect(response.statusCode).toBe(422);
    expect(response.headers["x-correlation-id"]).toBe(correlationId);
    const body = JSON.parse(response.body);
    expect(body.correlationId).toBeUndefined();
    expect(body.error.correlationId).toBe(correlationId);
  });

  it("odrzuca powtórzone badanie bez częściowych rekordów", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();

    const response = await createOrder(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }, { medicalTestId: tests.CRP.id }]
    });

    expectOrderValidation(response, "tests.1.medicalTestId", "DUPLICATE_TEST");
    await expectOrderTablesCount(0, 0, 0);
  });

  it("odrzuca nieistniejące i nieaktywne badanie", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();

    const notFound = await createOrder(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: "missing-test" }]
    });
    expectOrderValidation(
      notFound,
      "tests.0.medicalTestId",
      "MEDICAL_TEST_NOT_FOUND"
    );

    await prisma.medicalTest.update({
      where: { id: tests.TSH.id },
      data: { active: false }
    });
    const inactive = await createOrder(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.TSH.id }]
    });
    expectOrderValidation(
      inactive,
      "tests.0.medicalTestId",
      "MEDICAL_TEST_INACTIVE"
    );
    await expectOrderTablesCount(0, 0, 0);
  });

  it("odrzuca nieaktywnego pacjenta", async () => {
    const { token, workspaceId, tests } = await setupDefaultOrderData();
    const patient = await createTestPatient(prisma, {
      workspaceId,
      firstName: "Jan",
      lastName: "Nieaktywny",
      identifierType: "OTHER_DOCUMENT",
      documentType: "PASSPORT",
      documentNumber: "INACTIVE-1",
      documentCountry: "PL",
      birthDate: "1988-03-12",
      gender: "MALE",
      active: false
    });

    const response = await createOrder(token, {
      patientId: patient.id,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    expectOrderValidation(response, "patientId", "PATIENT_INACTIVE");
    await expectOrderTablesCount(0, 0, 0);
  });

  it("traktuje pacjenta z innego workspace’u jak nieistniejącego", async () => {
    const workspaceA = await setupDefaultOrderData();
    const workspaceB = await createWorkspaceWithPatient("staff.b", "02270803624");

    const response = await createOrder(workspaceA.token, {
      patientId: workspaceB.patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: workspaceA.tests.CRP.id }]
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error.code).toBe("PATIENT_NOT_FOUND");
    await expectOrderTablesCount(0, 0, 0);
  });

  it("waliduje wymagane dane dodatkowe GLU i zachowuje false", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();

    const missing = await createOrder(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ medicalTestId: tests.GLU.id, additionalData: {} }]
    });
    expectOrderValidation(
      missing,
      "tests.0.additionalData.PATIENT_PREPARED",
      "REQUIRED_ADDITIONAL_DATA"
    );

    const created = await createOrder(token, {
      patientId,
      priority: "ROUTINE",
      tests: [
        {
          medicalTestId: tests.GLU.id,
          additionalData: { PATIENT_PREPARED: false }
        }
      ]
    });

    expect(created.statusCode).toBe(201);
    expect(JSON.parse(created.body).tests[0]).toMatchObject({
      code: "GLU",
      additionalData: { PATIENT_PREPARED: false }
    });
    const savedOrderTest = await prisma.orderTest.findFirstOrThrow();
    expect(savedOrderTest.additionalData).toEqual({ PATIENT_PREPARED: false });
  });

  it("odrzuca niepoprawny typ i nieznany klucz additionalData", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();

    const invalidType = await createOrder(token, {
      patientId,
      priority: "ROUTINE",
      tests: [
        {
          medicalTestId: tests.GLU.id,
          additionalData: { PATIENT_PREPARED: "tak" }
        }
      ]
    });
    expectOrderValidation(
      invalidType,
      "tests.0.additionalData.PATIENT_PREPARED",
      "INVALID_ADDITIONAL_DATA_TYPE"
    );

    const unknown = await createOrder(token, {
      patientId,
      priority: "ROUTINE",
      tests: [
        {
          medicalTestId: tests.CRP.id,
          additionalData: { UNKNOWN: true }
        }
      ]
    });
    expectOrderValidation(
      unknown,
      "tests.0.additionalData.UNKNOWN",
      "UNKNOWN_ADDITIONAL_DATA_FIELD"
    );
    await expectOrderTablesCount(0, 0, 0);
  });

  it("odrzuca błędy struktury requestu jako 400", async () => {
    const { token, patientId } = await setupDefaultOrderData();

    const response = await createOrder(token, {
      patientId,
      priority: "ROUTINE",
      tests: [{ additionalData: [] }]
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fieldErrors: expect.arrayContaining([
          expect.objectContaining({
            field: "tests.0.medicalTestId",
            message: "Pole musi być tekstem."
          }),
          expect.objectContaining({
            field: "tests.0.additionalData",
            message: "Dane dodatkowe muszą być obiektem."
          })
        ])
      }
    });
  });

  it("odrzuca status, workspaceId i createdByUserId w payloadzie", async () => {
    const { token, patientId, tests } = await setupDefaultOrderData();

    const response = await createOrder(token, {
      patientId,
      priority: "ROUTINE",
      workspaceId: "obcy-workspace",
      createdByUserId: "obcy-uzytkownik",
      status: "COMPLETED",
      externalOrderId: "zewnetrzne",
      correlationId: "correlation",
      tests: [{ medicalTestId: tests.CRP.id }]
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.fieldErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "workspaceId", code: "UNKNOWN_FIELD" }),
        expect.objectContaining({ field: "createdByUserId", code: "UNKNOWN_FIELD" }),
        expect.objectContaining({ field: "status", code: "UNKNOWN_FIELD" })
      ])
    );
    await expectOrderTablesCount(0, 0, 0);
  });

  it("publikuje polskie opisy POST /api/v1/orders w OpenAPI", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/docs-json"
    });

    expect(response.statusCode).toBe(200);
    const document = JSON.parse(response.body);
    expect(document.paths["/api/v1/orders"].post).toMatchObject({
      summary: "Utworzenie zlecenia badań"
    });
    expect(document.paths["/api/v1/orders"].post.description).toContain(
      "automatycznie tworzy wymagane próbki"
    );
    expect(document.paths["/api/v1/orders"].post.responses["422"].description).toContain(
      "reguły biznesowe"
    );
    expectSharedApiErrorSchema(
      document,
      document.paths["/api/v1/orders"].post.responses["422"].content[
        "application/json"
      ].schema
    );
    expect(JSON.stringify(document.paths["/api/v1/orders"].post)).toContain(
      "mg/dL"
    );
  });

  async function setupDefaultOrderData() {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login: "staff.demo", password: "SeedTestowe123!" }
    });
    expect(loginResponse.statusCode).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({
      where: { login: "staff.demo" }
    });
    const patient = await prisma.patient.findFirstOrThrow({
      where: { workspaceId: user.workspaceId, active: true }
    });
    const catalog = await prisma.medicalTest.findMany({
      orderBy: { code: "asc" }
    });
    const tests = Object.fromEntries(catalog.map((test) => [test.code, test]));

    return {
      token: JSON.parse(loginResponse.body).token as string,
      userId: user.id,
      workspaceId: user.workspaceId,
      patientId: patient.id,
      tests: tests as Record<string, { id: string }>
    };
  }

  async function createWorkspaceWithPatient(login: string, pesel: string) {
    const password = "HasloTestowe123!";
    const { workspace } = await createStaffUser(prisma, {
      workspaceSlug: login.replace(".", "-"),
      workspaceName: `Klinika ${login}`,
      login,
      password
    });
    const patient = await createTestPatient(prisma, {
      workspaceId: workspace.id,
      firstName: "Anna",
      lastName: "Obca",
      pesel,
      birthDate: "2002-07-08",
      gender: "FEMALE"
    });

    return { workspaceId: workspace.id, patientId: patient.id };
  }

  async function createOrder(token: string, payload: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: { authorization: `Bearer ${token}` },
      payload
    });
  }

  async function expectOrderTablesCount(
    orders: number,
    orderTests: number,
    samples: number
  ) {
    await expect(prisma.order.count()).resolves.toBe(orders);
    await expect(prisma.orderTest.count()).resolves.toBe(orderTests);
    await expect(prisma.sample.count()).resolves.toBe(samples);
  }
});

function expectOrderValidation(
  response: { statusCode: number; body: string },
  field: string,
  code: string
) {
  expect(response.statusCode).toBe(422);
  expect(JSON.parse(response.body)).toMatchObject({
    error: {
      code: "ORDER_VALIDATION_ERROR",
      fieldErrors: expect.arrayContaining([
        expect.objectContaining({ field, code })
      ])
    }
  });
}

function expectSharedApiErrorSchema(
  document: {
    components: { schemas: Record<string, Record<string, unknown>> };
  },
  schema: { $ref?: string }
) {
  const apiError = resolveSchema(document, schema);
  expect(apiError.properties).toHaveProperty("error");
  expect(apiError.properties).not.toHaveProperty("correlationId");
  expect(apiError.required).toEqual(["error"]);

  const details = resolveSchema(
    document,
    (apiError.properties as Record<string, { $ref: string }>).error
  );
  expect(details.properties).toHaveProperty("correlationId");
  expect(details.required).toEqual(
    expect.arrayContaining(["code", "message", "correlationId"])
  );
  expect(details.required).not.toContain("fieldErrors");

  const fieldErrors = (
    details.properties as Record<
      string,
      { items: { $ref: string }; type: string }
    >
  ).fieldErrors;
  expect(fieldErrors).toMatchObject({ type: "array" });
  const fieldError = resolveSchema(document, fieldErrors.items);
  expect(fieldError.properties).toHaveProperty("field");
  expect(fieldError.properties).toHaveProperty("code");
  expect(fieldError.properties).toHaveProperty("message");
}

function resolveSchema(
  document: {
    components: { schemas: Record<string, Record<string, unknown>> };
  },
  schema: { $ref?: string; allOf?: { $ref?: string }[] }
) {
  if (!schema.$ref && schema.allOf?.length) {
    return resolveSchema(document, schema.allOf[0]);
  }

  expect(schema.$ref).toBeDefined();
  const name = schema.$ref!.replace("#/components/schemas/", "");
  expect(document.components.schemas[name]).toBeDefined();
  return document.components.schemas[name] as {
    properties: Record<string, unknown>;
    required?: string[];
  };
}
