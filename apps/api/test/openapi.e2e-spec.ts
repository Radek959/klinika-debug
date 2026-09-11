import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { closeTestApp, createTestApp } from "./test-app";
import { configureTestEnvironment, resetTestDatabase } from "./database";

interface OpenApiOperation {
  summary?: string;
  description?: string;
  parameters?: Array<{ name: string; in: string; required?: boolean }>;
  responses?: Record<string, { description?: string; headers?: Record<string, unknown> }>;
}

interface OpenApiDocument {
  info: { description?: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
}

describe("openapi contract documentation", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let document: OpenApiDocument;

  beforeAll(async () => {
    configureTestEnvironment();
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const response = await app.inject({ method: "GET", url: "/api/docs-json" });
    expect(response.statusCode).toBe(200);
    document = JSON.parse(response.body) as OpenApiDocument;
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  function operations(): Array<{ path: string; method: string; operation: OpenApiOperation }> {
    const all: Array<{ path: string; method: string; operation: OpenApiOperation }> = [];
    for (const [path, methods] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        all.push({ path, method, operation });
      }
    }
    return all;
  }

  function hasParam(operation: OpenApiOperation, name: string): boolean {
    return (operation.parameters ?? []).some(
      (param) => param.name === name && param.in === "path"
    );
  }

  function hasOptionalCorrelationIdHeader(operation: OpenApiOperation): boolean {
    return (operation.parameters ?? []).some(
      (param) =>
        param.name === "X-Correlation-ID" &&
        param.in === "header" &&
        param.required !== true
    );
  }

  it("opisuje szybki start, uwierzytelnienie i correlation ID w top-level description", () => {
    const description = document.info.description ?? "";
    expect(description).toContain("auth/login");
    expect(description).toContain("Bearer");
    expect(description).toContain("X-Correlation-ID");
    expect(description.toLowerCase()).toContain("workspace");
  });

  it("nie ujawnia panelu /admin w OpenAPI", () => {
    const paths = Object.keys(document.paths);
    expect(paths.some((path) => path.includes("admin"))).toBe(false);
    expect(JSON.stringify(document)).not.toContain("/admin");
  });

  it("nie ujawnia nazw kontrolowanych defektów warsztatowych", () => {
    const serialized = JSON.stringify(document);
    for (const bugName of [
      "PATIENT_GUARDIAN",
      "ORDER_FLOW",
      "API_DIAGNOSTICS",
      "PATIENT_EDIT_NOT_SAVED",
      "ORDER_PRIORITY_MAPPING"
    ]) {
      expect(serialized).not.toContain(bugName);
    }
  });

  it("catalogFlag pozostaje neutralną wartością techniczną", () => {
    const serialized = JSON.stringify(document);
    const catalogFlagIndex = serialized.indexOf("catalogFlag");
    expect(catalogFlagIndex).toBeGreaterThan(-1);
    for (const forbidden of ["priority", "routing", "workshop", "trainer", "admin", "controlled bug"]) {
      const schema = document.paths["/api/v1/tests"]?.get;
      const testsResponseText = JSON.stringify(schema);
      expect(testsResponseText.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("każda operacja z {patientId} ma opisany path parameter", () => {
    const patientIdOps = operations().filter(({ path }) => path.includes("{patientId}"));
    expect(patientIdOps.length).toBeGreaterThan(0);
    for (const { operation } of patientIdOps) {
      expect(hasParam(operation, "patientId")).toBe(true);
    }
  });

  it("każda operacja z {orderId} ma opisany path parameter", () => {
    const orderIdOps = operations().filter(({ path }) => path.includes("{orderId}"));
    expect(orderIdOps.length).toBeGreaterThan(0);
    for (const { operation } of orderIdOps) {
      expect(hasParam(operation, "orderId")).toBe(true);
    }
  });

  it("auth ma poprawne 400/401/204", () => {
    const login = document.paths["/api/v1/auth/login"]?.post;
    expect(login?.responses?.["400"]).toBeDefined();
    expect(login?.responses?.["401"]).toBeDefined();

    const logout = document.paths["/api/v1/auth/logout"]?.post;
    expect(logout?.responses?.["204"]).toBeDefined();
    expect(logout?.responses?.["401"]).toBeDefined();

    const me = document.paths["/api/v1/auth/me"]?.get;
    expect(me?.responses?.["401"]).toBeDefined();
  });

  it("patients ma wymagane 400/401/404/409/422", () => {
    const create = document.paths["/api/v1/patients"]?.post;
    expect(create?.responses?.["400"]).toBeDefined();
    expect(create?.responses?.["401"]).toBeDefined();
    expect(create?.responses?.["409"]).toBeDefined();
    expect(create?.responses?.["422"]).toBeDefined();

    const getById = document.paths["/api/v1/patients/{patientId}"]?.get;
    expect(getById?.responses?.["404"]).toBeDefined();

    const update = document.paths["/api/v1/patients/{patientId}"]?.patch;
    expect(update?.responses?.["400"]).toBeDefined();
    expect(update?.responses?.["404"]).toBeDefined();
    expect(update?.responses?.["409"]).toBeDefined();
    expect(update?.responses?.["422"]).toBeDefined();

    const list = document.paths["/api/v1/patients"]?.get;
    expect(list?.responses?.["400"]).toBeDefined();
    expect(list?.responses?.["401"]).toBeDefined();
  });

  it("send dokumentuje 429, 503 i 504 z Retry-After i LAB_SEND_TIMEOUT", () => {
    const send = document.paths["/api/v1/orders/{orderId}/send"]?.post;
    expect(send?.responses?.["429"]).toBeDefined();
    expect(send?.responses?.["503"]).toBeDefined();
    expect(send?.responses?.["504"]).toBeDefined();

    for (const status of ["429", "503", "504"]) {
      const headers = send?.responses?.[status]?.headers ?? {};
      expect(Object.keys(headers)).toEqual(
        expect.arrayContaining(["Retry-After", "X-Correlation-ID"])
      );
    }

    const serialized = JSON.stringify(send?.responses?.["504"]);
    expect(serialized).toContain("LAB_SEND_TIMEOUT");
  });

  it("rejestracja próbki dokumentuje regułę tej samej minuty", () => {
    const registerSample = document.paths["/api/v1/orders/{orderId}/samples"]?.post;
    expect(registerSample?.description ?? "").toContain("minut");
  });

  it("reprezentatywne participant endpointy dokumentują opcjonalny X-Correlation-ID", () => {
    const withHeader: Array<{ path: string; method: "get" | "post" | "patch" }> = [
      { path: "/api/v1/auth/me", method: "get" },
      { path: "/api/v1/auth/logout", method: "post" },
      { path: "/api/v1/dashboard/summary", method: "get" },
      { path: "/api/v1/patients", method: "post" },
      { path: "/api/v1/patients/{patientId}", method: "get" },
      { path: "/api/v1/tests", method: "get" },
      { path: "/api/v1/orders", method: "post" },
      { path: "/api/v1/orders/{orderId}", method: "get" },
      { path: "/api/v1/orders/{orderId}/send", method: "post" }
    ];

    for (const { path, method } of withHeader) {
      const operation = document.paths[path]?.[method];
      expect(operation).toBeDefined();
      expect(
        hasOptionalCorrelationIdHeader(operation as OpenApiOperation)
      ).toBe(true);
    }

    // Endpoint logowania nie ma jeszcze sesji, więc korelacja żądania z
    // istniejącą sesją nie ma tu zastosowania.
    const login = document.paths["/api/v1/auth/login"]?.post;
    expect(hasOptionalCorrelationIdHeader(login as OpenApiOperation)).toBe(false);
  });

  it("health i webhook laboratorium nie dokumentują X-Correlation-ID uczestnika", () => {
    const live = document.paths["/health/live"]?.get;
    const ready = document.paths["/health/ready"]?.get;
    const labWebhook = document.paths["/api/v1/integrations/lab/results"]?.post;

    for (const operation of [live, ready, labWebhook]) {
      if (!operation) {
        continue;
      }
      expect(hasOptionalCorrelationIdHeader(operation)).toBe(false);
    }
  });
});
