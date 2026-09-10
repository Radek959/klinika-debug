import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { seedDatabase } from "../src/common/prisma/seed-database";
import { closeTestApp, createTestApp } from "./test-app";
import {
  configureTestEnvironment,
  createStaffUser,
  resetTestDatabase
} from "./database";

describe("tests catalog api", () => {
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

  it("wymaga tokenu Bearer", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/tests"
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error.code).toBe(
      "AUTHENTICATION_REQUIRED"
    );
  });

  it("zwraca pełny wspólny katalog bez workspaceId", async () => {
    const { token } = await authenticate("staff.demo", "SeedTestowe123!");

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/tests",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 5,
      totalPages: 1,
      catalogFlag: false
    });
    expect(body.items.map((item: { code: string }) => item.code)).toEqual([
      "CRP",
      "GLU",
      "MORF",
      "TSH",
      "URINE"
    ]);
    expect(JSON.stringify(body)).not.toContain("workspaceId");
  });

  it("zwraca identyczny katalog dla dwóch workspace’ów", async () => {
    const password = "HasloTestowe123!";
    await createStaffUser(prisma, {
      workspaceSlug: "klinika-druga",
      workspaceName: "Klinika Druga",
      login: "staff.druga",
      password
    });
    const { token: tokenA } = await authenticate("staff.demo", "SeedTestowe123!");
    const { token: tokenB } = await authenticate("staff.druga", password);

    const [responseA, responseB] = await Promise.all([
      app.inject({
        method: "GET",
        url: "/api/v1/tests?sort=name&order=asc",
        headers: { authorization: `Bearer ${tokenA}` }
      }),
      app.inject({
        method: "GET",
        url: "/api/v1/tests?sort=name&order=asc",
        headers: { authorization: `Bearer ${tokenB}` }
      })
    ]);

    expect(responseA.statusCode).toBe(200);
    expect(responseB.statusCode).toBe(200);
    const codesA = JSON.parse(responseA.body).items.map(
      (item: { code: string }) => item.code
    );
    const codesB = JSON.parse(responseB.body).items.map(
      (item: { code: string }) => item.code
    );
    expect(codesA).toEqual(codesB);
  });

  it("obsługuje paginację", async () => {
    const { token } = await authenticate("staff.demo", "SeedTestowe123!");

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/tests?page=2&pageSize=2&sort=code&order=asc",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      page: 2,
      pageSize: 2,
      total: 5,
      totalPages: 3,
      items: [
        expect.objectContaining({ code: "MORF" }),
        expect.objectContaining({ code: "TSH" })
      ]
    });
  });

  it("wyszukuje po kodzie, nazwie i opisie", async () => {
    const { token } = await authenticate("staff.demo", "SeedTestowe123!");

    const byCode = await getTests(token, "search=glu");
    expect(byCode.items).toEqual([expect.objectContaining({ code: "GLU" })]);

    const byName = await getTests(token, "search=morfologia");
    expect(byName.items).toEqual([expect.objectContaining({ code: "MORF" })]);

    const byDescription = await getTests(token, "search=moczu");
    expect(byDescription.items).toEqual([
      expect.objectContaining({ code: "URINE" })
    ]);
  });

  it("filtruje po materiale i aktywności", async () => {
    const { token } = await authenticate("staff.demo", "SeedTestowe123!");
    await prisma.medicalTest.update({
      where: { code: "TSH" },
      data: { active: false }
    });

    const serum = await getTests(token, "materialType=SERUM&sort=code");
    expect(serum.items.map((item: { code: string }) => item.code)).toEqual([
      "CRP",
      "GLU",
      "TSH"
    ]);

    const inactive = await getTests(token, "active=false");
    expect(inactive.items).toEqual([expect.objectContaining({ code: "TSH" })]);

    const active = await getTests(token, "active=true");
    expect(active.items.map((item: { code: string }) => item.code)).not.toContain(
      "TSH"
    );
  });

  it("sortuje stabilnie i zwraca parametry we właściwej kolejności", async () => {
    const { token } = await authenticate("staff.demo", "SeedTestowe123!");

    const byDuration = await getTests(
      token,
      "sort=estimatedDurationMinutes&order=asc"
    );
    expect(byDuration.items.map((item: { code: string }) => item.code)).toEqual([
      "CRP",
      "GLU",
      "MORF",
      "TSH",
      "URINE"
    ]);

    const morf = byDuration.items.find(
      (item: { code: string }) => item.code === "MORF"
    );
    expect(morf.parameters.map((parameter: { code: string }) => parameter.code)).toEqual([
      "WBC",
      "RBC",
      "HGB",
      "PLT"
    ]);

    const glu = byDuration.items.find(
      (item: { code: string }) => item.code === "GLU"
    );
    expect(glu.requiredFields).toEqual([
      expect.objectContaining({
        code: "PATIENT_PREPARED",
        label: "Potwierdzenie przygotowania pacjenta",
        valueType: "BOOLEAN",
        required: true,
        displayOrder: 1
      })
    ]);
  });

  it("zwraca kontrolowany błąd dla niepoprawnych parametrów query", async () => {
    const { token } = await authenticate("staff.demo", "SeedTestowe123!");

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/tests?pageSize=101&search=${"a".repeat(101)}`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fieldErrors: expect.arrayContaining([
          expect.objectContaining({
            field: "pageSize",
            message: "Rozmiar strony nie może przekraczać 100."
          }),
          expect.objectContaining({
            field: "search",
            message: "Szukana fraza może mieć maksymalnie 100 znaków."
          })
        ])
      }
    });
  });

  it("publikuje polskie opisy katalogu w OpenAPI", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/docs-json"
    });

    expect(response.statusCode).toBe(200);
    const document = JSON.parse(response.body);
    expect(document.paths["/api/v1/tests"].get).toMatchObject({
      summary: "Katalog badań"
    });
    expect(document.paths["/api/v1/tests"].get.description).toContain(
      "wspólny katalog badań"
    );
    expect(document.paths["/api/v1/tests"].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "materialType",
          description: "Filtr rodzaju materiału wymaganego do badania."
        }),
        expect.objectContaining({
          name: "search",
          description: "Wyszukiwanie po kodzie, nazwie albo opisie badania."
        })
      ])
    );
    expect(
      document.paths["/api/v1/tests"].get.responses["400"].content[
        "application/json"
      ].schema
    ).toBeDefined();
    expectSharedApiErrorSchema(
      document,
      document.paths["/api/v1/tests"].get.responses["400"].content[
        "application/json"
      ].schema
    );
  });

  async function getTests(token: string, query: string) {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/tests?${query}`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(response.statusCode).toBe(200);
    return JSON.parse(response.body);
  }

  async function authenticate(login: string, password: string) {
    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { login, password }
    });
    expect(loginResponse.statusCode).toBe(200);

    return {
      token: JSON.parse(loginResponse.body).token as string
    };
  }
});

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
