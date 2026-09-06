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

describe("orders read api", () => {
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

  describe("GET /api/v1/orders", () => {
    it("odrzuca brak tokenu", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/orders"
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error.code).toBe("AUTHENTICATION_REQUIRED");
    });

    it("zwraca pustą listę bez zleceń", async () => {
      const { token } = await setupDefaultOrderData();

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/orders",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0
      });
    });

    it("zwraca listę zleceń z domyślnym sortowaniem updatedAt desc", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      // Create multiple orders
      await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await createOrder(token, {
        patientId,
        priority: "URGENT",
        tests: [{ medicalTestId: tests.GLU.id, additionalData: { PATIENT_PREPARED: true } }]
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/orders",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.total).toBe(2);
      expect(body.items).toHaveLength(2);
      expect(body.items[0].priority).toBe("URGENT");
      expect(body.items[1].priority).toBe("ROUTINE");
    });

    it("obsługuje paginację", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      // Create 5 orders
      for (let i = 0; i < 5; i++) {
        await createOrder(token, {
          patientId,
          priority: "ROUTINE",
          tests: [{ medicalTestId: tests.CRP.id }]
        });
      }

      const page1 = await app.inject({
        method: "GET",
        url: "/api/v1/orders?page=1&pageSize=2",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(page1.statusCode).toBe(200);
      const body1 = JSON.parse(page1.body);
      expect(body1.page).toBe(1);
      expect(body1.pageSize).toBe(2);
      expect(body1.total).toBe(5);
      expect(body1.totalPages).toBe(3);
      expect(body1.items).toHaveLength(2);

      const page2 = await app.inject({
        method: "GET",
        url: "/api/v1/orders?page=2&pageSize=2",
        headers: { authorization: `Bearer ${token}` }
      });

      const body2 = JSON.parse(page2.body);
      expect(body2.page).toBe(2);
      expect(body2.items).toHaveLength(2);

      const page3 = await app.inject({
        method: "GET",
        url: "/api/v1/orders?page=3&pageSize=2",
        headers: { authorization: `Bearer ${token}` }
      });

      const body3 = JSON.parse(page3.body);
      expect(body3.page).toBe(3);
      expect(body3.items).toHaveLength(1);
    });

    it("filtruje po statusie", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      const order1 = await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      const order1Id = JSON.parse(order1.body).id;

      // Manually update status in database
      await prisma.order.update({
        where: { id: order1Id },
        data: { status: "SAMPLE_COLLECTED" }
      });

      const draftResponse = await app.inject({
        method: "GET",
        url: "/api/v1/orders?status=DRAFT",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(draftResponse.statusCode).toBe(200);
      const draftBody = JSON.parse(draftResponse.body);
      expect(draftBody.total).toBe(0);

      const collectedResponse = await app.inject({
        method: "GET",
        url: "/api/v1/orders?status=SAMPLE_COLLECTED",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(collectedResponse.statusCode).toBe(200);
      const collectedBody = JSON.parse(collectedResponse.body);
      expect(collectedBody.total).toBe(1);
      expect(collectedBody.items[0].status).toBe("SAMPLE_COLLECTED");
    });

    it.each([
      "DRAFT",
      "SAMPLE_COLLECTION_IN_PROGRESS",
      "SAMPLE_COLLECTED",
      "SENT_TO_LAB",
      "PROCESSING",
      "PARTIAL",
      "COMPLETED",
      "REJECTED",
      "TECHNICAL_ERROR"
    ])("filtruje status %s", async (status) => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const created = await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      await prisma.order.update({
        where: { id: JSON.parse(created.body).id as string },
        data: { status: status as any }
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/orders?status=${status}`,
        headers: { authorization: `Bearer ${token}` }
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).items).toEqual([
        expect.objectContaining({ status })
      ]);
    });

    it("filtruje po priorytecie", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      await createOrder(token, {
        patientId,
        priority: "URGENT",
        tests: [{ medicalTestId: tests.GLU.id, additionalData: { PATIENT_PREPARED: false } }]
      });

      const routineResponse = await app.inject({
        method: "GET",
        url: "/api/v1/orders?priority=ROUTINE",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(routineResponse.statusCode).toBe(200);
      const routineBody = JSON.parse(routineResponse.body);
      expect(routineBody.total).toBe(1);
      expect(routineBody.items[0].priority).toBe("ROUTINE");

      const urgentResponse = await app.inject({
        method: "GET",
        url: "/api/v1/orders?priority=URGENT",
        headers: { authorization: `Bearer ${token}` }
      });

      const urgentBody = JSON.parse(urgentResponse.body);
      expect(urgentBody.total).toBe(1);
      expect(urgentBody.items[0].priority).toBe("URGENT");
    });

    it("filtruje po patientId", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const { patientId: otherPatientId } = await createTestPatient(prisma, {
        workspaceId: (await prisma.user.findUniqueOrThrow({ where: { login: "staff.demo" } }))
          .workspaceId,
        firstName: "Jan",
        lastName: "Nowak",
        pesel: "85010112345",
        birthDate: "1985-01-01",
        gender: "MALE"
      }).then((p) => ({ patientId: p.id }));

      await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      await createOrder(token, {
        patientId: otherPatientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/orders?patientId=${patientId}`,
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.total).toBe(1);
      expect(body.items[0].patient.id).toBe(patientId);
    });

    it("filtruje po rodzaju materiału", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }] // SERUM
      });
      await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.GLU.id, additionalData: { PATIENT_PREPARED: false } }] // SERUM
      });

      const serumResponse = await app.inject({
        method: "GET",
        url: "/api/v1/orders?materialType=SERUM",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(serumResponse.statusCode).toBe(200);
      const serumBody = JSON.parse(serumResponse.body);
      expect(serumBody.total).toBe(2);

      const urineResponse = await app.inject({
        method: "GET",
        url: "/api/v1/orders?materialType=URINE",
        headers: { authorization: `Bearer ${token}` }
      });

      const urineBody = JSON.parse(urineResponse.body);
      expect(urineBody.total).toBe(0);
    });

    it("filtruje po dacie utworzenia od początku wskazanego dnia", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const tomorrow = new Date(now.getTime() + 86400000).toISOString().split("T")[0];

      await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });

      const todayResponse = await app.inject({
        method: "GET",
        url: `/api/v1/orders?createdFrom=${today}`,
        headers: { authorization: `Bearer ${token}` }
      });

      expect(todayResponse.statusCode).toBe(200);
      const todayBody = JSON.parse(todayResponse.body);
      expect(todayBody.total).toBe(1);

      const tomorrowResponse = await app.inject({
        method: "GET",
        url: `/api/v1/orders?createdFrom=${tomorrow}`,
        headers: { authorization: `Bearer ${token}` }
      });

      const tomorrowBody = JSON.parse(tomorrowResponse.body);
      expect(tomorrowBody.total).toBe(0);
    });

    it("filtruje po dacie utworzenia do końca wskazanego dnia", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];

      await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });

      const todayResponse = await app.inject({
        method: "GET",
        url: `/api/v1/orders?createdTo=${today}`,
        headers: { authorization: `Bearer ${token}` }
      });

      expect(todayResponse.statusCode).toBe(200);
      const todayBody = JSON.parse(todayResponse.body);
      expect(todayBody.total).toBe(1);

      const yesterdayResponse = await app.inject({
        method: "GET",
        url: `/api/v1/orders?createdTo=${yesterday}`,
        headers: { authorization: `Bearer ${token}` }
      });

      const yesterdayBody = JSON.parse(yesterdayResponse.body);
      expect(yesterdayBody.total).toBe(0);
    });

    it("kombinuje kilka filtrów", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      await createOrder(token, {
        patientId,
        priority: "URGENT",
        tests: [{ medicalTestId: tests.GLU.id, additionalData: { PATIENT_PREPARED: false } }]
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/orders?priority=URGENT&materialType=SERUM",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.total).toBe(1);
      expect(body.items[0].priority).toBe("URGENT");
    });

    it("wyszukuje po identyfikatorze zlecenia", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      const response1 = await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      const orderId = JSON.parse(response1.body).id;

      const searchResponse = await app.inject({
        method: "GET",
        url: `/api/v1/orders?search=${orderId}`,
        headers: { authorization: `Bearer ${token}` }
      });

      expect(searchResponse.statusCode).toBe(200);
      const searchBody = JSON.parse(searchResponse.body);
      expect(searchBody.total).toBe(1);
      expect(searchBody.items[0].id).toBe(orderId);
    });

    it("wyszukuje po polach integracyjnych, danych pacjenta i badaniu", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const created = await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      const orderId = JSON.parse(created.body).id as string;
      await prisma.order.update({
        where: { id: orderId },
        data: {
          externalOrderId: "LAB-ORDER-42",
          correlationId: "corr-42"
        }
      });
      const patient = await prisma.patient.findUniqueOrThrow({
        where: { id: patientId }
      });

      for (const search of [
        "lab-order-42",
        "CORR-42",
        patient.firstName,
        patient.lastName,
        patient.pesel!,
        "crp"
      ]) {
        const response = await app.inject({
          method: "GET",
          url: `/api/v1/orders?search=${encodeURIComponent(search)}`,
          headers: { authorization: `Bearer ${token}` }
        });
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).items).toEqual([
          expect.objectContaining({ id: orderId })
        ]);
      }
    });

    it("wyszukuje po imieniu i nazwisku pacjenta", async () => {
      const { token } = await setupDefaultOrderData();
      const user = await prisma.user.findUniqueOrThrow({
        where: { login: "staff.demo" }
      });
      const patient = await createTestPatient(prisma, {
        workspaceId: user.workspaceId,
        firstName: "Urszula",
        lastName: "Zielińska",
        pesel: "95011122345",
        birthDate: "1995-01-11",
        gender: "FEMALE"
      });
      const tests = await prisma.medicalTest.findMany({
        orderBy: { code: "asc" }
      });

      await createOrder(token, {
        patientId: patient.id,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests[0].id }]
      });

      const firstNameResponse = await app.inject({
        method: "GET",
        url: "/api/v1/orders?search=Urszula",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(firstNameResponse.statusCode).toBe(200);
      const firstNameBody = JSON.parse(firstNameResponse.body);
      expect(firstNameBody.total).toBe(1);

      const lastNameResponse = await app.inject({
        method: "GET",
        url: "/api/v1/orders?search=Zielińska",
        headers: { authorization: `Bearer ${token}` }
      });

      const lastNameBody = JSON.parse(lastNameResponse.body);
      expect(lastNameBody.total).toBe(1);
    });

    it("wyszukuje bez rozróżniania wielkości liter", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      const response1 = await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      const orderId = JSON.parse(response1.body).id;

      const upperResponse = await app.inject({
        method: "GET",
        url: `/api/v1/orders?search=${orderId.toUpperCase()}`,
        headers: { authorization: `Bearer ${token}` }
      });

      expect(upperResponse.statusCode).toBe(200);
      const upperBody = JSON.parse(upperResponse.body);
      expect(upperBody.total).toBe(1);

      const lowerResponse = await app.inject({
        method: "GET",
        url: `/api/v1/orders?search=${orderId.toLowerCase()}`,
        headers: { authorization: `Bearer ${token}` }
      });

      const lowerBody = JSON.parse(lowerResponse.body);
      expect(lowerBody.total).toBe(1);
    });

    it("obsługuje pustą frazę wyszukiwania jako brak parametru", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/orders?search=   ",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.total).toBe(1);
    });

    it("sortuje po dacie utworzenia", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });

      const descResponse = await app.inject({
        method: "GET",
        url: "/api/v1/orders?sort=createdAt&order=desc",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(descResponse.statusCode).toBe(200);
      const descBody = JSON.parse(descResponse.body);
      const createdTimes = descBody.items.map((item: any) => new Date(item.createdAt).getTime());
      expect(createdTimes).toEqual([...createdTimes].sort((a, b) => b - a));

      const ascResponse = await app.inject({
        method: "GET",
        url: "/api/v1/orders?sort=createdAt&order=asc",
        headers: { authorization: `Bearer ${token}` }
      });

      const ascBody = JSON.parse(ascResponse.body);
      const ascTimes = ascBody.items.map((item: any) => new Date(item.createdAt).getTime());
      expect(ascTimes).toEqual([...ascTimes].sort((a, b) => a - b));
    });

    it("sortuje po nazwisku, imieniu i identyfikatorze zlecenia", async () => {
      const { token, workspaceId, tests } = await setupDefaultOrderData();
      const [anna, beata] = await Promise.all([
        createTestPatient(prisma, {
          workspaceId,
          firstName: "Anna",
          lastName: "Nowak",
          pesel: "85010112340",
          birthDate: "1985-01-01",
          gender: "FEMALE"
        }),
        createTestPatient(prisma, {
          workspaceId,
          firstName: "Beata",
          lastName: "Nowak",
          pesel: "85010112341",
          birthDate: "1985-01-01",
          gender: "FEMALE"
        })
      ]);
      await createOrder(token, {
        patientId: beata.id,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      await createOrder(token, {
        patientId: anna.id,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/orders?sort=patientLastName&order=asc",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).items.map((item: { patient: { firstName: string } }) => item.patient.firstName)).toEqual(["Anna", "Beata"]);
    });

    it("odrzuca niepoprawny numer strony", async () => {
      const { token } = await setupDefaultOrderData();

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/orders?page=0",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.fieldErrors).toContainEqual(
        expect.objectContaining({ field: "page", code: "INVALID_PAGE" })
      );
    });

    it("odrzuca niepoprawny pageSize", async () => {
      const { token } = await setupDefaultOrderData();

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/orders?pageSize=101",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("odrzuca niepoprawny status", async () => {
      const { token } = await setupDefaultOrderData();

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/orders?status=INVALID_STATUS",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.fieldErrors).toContainEqual(
        expect.objectContaining({ field: "status", code: "INVALID_STATUS" })
      );
    });

    it("odrzuca niepoprawny format daty", async () => {
      const { token } = await setupDefaultOrderData();

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/orders?createdFrom=2026/09/01",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.fieldErrors).toContainEqual(
        expect.objectContaining({
          field: "createdFrom",
          code: "INVALID_DATE_FORMAT"
        })
      );
    });

    it("odrzuca niemożliwą datę", async () => {
      const { token } = await setupDefaultOrderData();

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/orders?createdFrom=2026-02-30",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.fieldErrors).toContainEqual(
        expect.objectContaining({
          field: "createdFrom",
          code: "INVALID_DATE_FORMAT"
        })
      );
    });

    it("odrzuca createdFrom późniejsze niż createdTo", async () => {
      const { token } = await setupDefaultOrderData();

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/orders?createdFrom=2026-09-10&createdTo=2026-09-05",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.fieldErrors).toContainEqual(
        expect.objectContaining({
          field: "createdFrom",
          code: "INVALID_DATE_RANGE"
        })
      );
      expect(body.error.fieldErrors).toContainEqual(
        expect.objectContaining({
          field: "createdTo",
          code: "INVALID_DATE_RANGE"
        })
      );
    });

    it("nie wykazuje danych innego workspace'u", async () => {
      const { token: token1 } = await setupDefaultOrderData();
      const { workspace: workspace2, user: user2 } = await createStaffUser(prisma, {
        workspaceSlug: "other-clinic",
        workspaceName: "Inna Klinika",
        login: "other.clinic",
        password: "OtherPassword123!"
      });

      // Manually create an order in the other workspace
      const otherPatient = await createTestPatient(prisma, {
        workspaceId: workspace2.id,
        firstName: "Obca",
        lastName: "Osoba",
        pesel: "85010112346",
        birthDate: "1985-01-01",
        gender: "FEMALE"
      });

      await prisma.order.create({
        data: {
          workspaceId: workspace2.id,
          patientId: otherPatient.id,
          createdByUserId: user2.id,
          priority: "ROUTINE",
          status: "DRAFT"
        }
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/orders",
        headers: { authorization: `Bearer ${token1}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.total).toBe(0);
      expect(body.items).toHaveLength(0);
    });

    it("nie znajduje zlecenia innego workspace'u także po jego identyfikatorze", async () => {
      const { token } = await setupDefaultOrderData();
      const { workspace, user } = await createStaffUser(prisma, {
        workspaceSlug: "other-clinic-search",
        workspaceName: "Inna Klinika",
        login: "other.search",
        password: "OtherPassword123!"
      });
      const patient = await createTestPatient(prisma, {
        workspaceId: workspace.id,
        firstName: "Obca",
        lastName: "Osoba",
        pesel: "85010112348",
        birthDate: "1985-01-01",
        gender: "FEMALE"
      });
      const otherOrder = await prisma.order.create({
        data: {
          workspaceId: workspace.id,
          patientId: patient.id,
          createdByUserId: user.id,
          priority: "ROUTINE"
        }
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/orders?search=${otherOrder.id}`,
        headers: { authorization: `Bearer ${token}` }
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).items).toEqual([]);
    });

    it("nie zawiera workspaceId w odpowiedzi", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/orders",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.workspaceId).toBeUndefined();
      expect(body.items[0].workspaceId).toBeUndefined();
    });

    it("publikuje listę zleceń i jej parametry w OpenAPI", async () => {
      const response = await app.inject({ method: "GET", url: "/api/docs-json" });
      expect(response.statusCode).toBe(200);
      const document = JSON.parse(response.body);
      const endpoint = document.paths["/api/v1/orders"].get;
      expect(endpoint.summary).toBe("Lista zleceń z bieżącego workspace'u");
      expect(endpoint.parameters.map((parameter: { name: string }) => parameter.name)).toEqual(
        expect.arrayContaining([
          "page",
          "pageSize",
          "search",
          "status",
          "priority",
          "patientId",
          "materialType",
          "createdFrom",
          "createdTo",
          "sort",
          "order"
        ])
      );
      expect(endpoint.responses).toHaveProperty("400");
      expect(endpoint.responses).toHaveProperty("401");
    });
  });

  describe("GET /api/v1/orders/{orderId}", () => {
    it("odrzuca brak tokenu", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/orders/order-123"
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error.code).toBe("AUTHENTICATION_REQUIRED");
    });

    it("zwraca szczegóły zlecenia", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      const createResponse = await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      const orderId = JSON.parse(createResponse.body).id;

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${orderId}`,
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        id: orderId,
        patientId,
        priority: "ROUTINE",
        status: "DRAFT",
        tests: expect.arrayContaining([
          expect.objectContaining({
            medicalTestId: tests.CRP.id,
            code: "CRP",
            name: "CRP",
            materialType: "SERUM"
          })
        ]),
        samples: expect.arrayContaining([
          expect.objectContaining({
            materialType: "SERUM",
            status: "REQUIRED"
          })
        ])
      });
      expect(body.patient).toBeDefined();
      expect(body.patient).toMatchObject({
        firstName: expect.any(String),
        lastName: expect.any(String),
        birthDate: expect.any(String),
        gender: expect.any(String),
        active: true
      });
    });

    it("zawiera dane pacjenta", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      const createResponse = await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      const orderId = JSON.parse(createResponse.body).id;

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${orderId}`,
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.patient).toMatchObject({
        id: patientId,
        firstName: expect.any(String),
        lastName: expect.any(String),
        identifierType: expect.stringMatching(/^(PESEL|OTHER_DOCUMENT)$/),
        birthDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        gender: expect.stringMatching(/^(FEMALE|MALE)$/),
        active: true
      });
    });

    it("zwraca additionalData w badaniach", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      const createResponse = await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [
          {
            medicalTestId: tests.GLU.id,
            additionalData: { PATIENT_PREPARED: false }
          }
        ]
      });
      const orderId = JSON.parse(createResponse.body).id;

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${orderId}`,
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.tests[0]).toMatchObject({
        code: "GLU",
        additionalData: { PATIENT_PREPARED: false }
      });
    });

    it("zwraca badania i próbki w wymaganej stabilnej kolejności", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();
      const created = await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [
          { medicalTestId: tests.URINE.id },
          { medicalTestId: tests.CRP.id },
          { medicalTestId: tests.MORF.id }
        ]
      });
      const orderId = JSON.parse(created.body).id as string;

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${orderId}`,
        headers: { authorization: `Bearer ${token}` }
      });
      expect(response.statusCode).toBe(200);
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
    });

    it("zwraca pola próbek", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      const createResponse = await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      const orderId = JSON.parse(createResponse.body).id;

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${orderId}`,
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.samples[0]).toMatchObject({
        id: expect.any(String),
        materialType: "SERUM",
        status: "REQUIRED",
        barcode: null,
        collectedAt: null,
        collectedByUserId: null,
        rejectionCode: null,
        rejectionReason: null
      });
    });

    it("zwraca format daty ISO", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      const createResponse = await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      const orderId = JSON.parse(createResponse.body).id;

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${orderId}`,
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
      expect(body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
      expect(body.patient.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("zwraca 404 dla nieistniejącego zlecenia", async () => {
      const { token } = await setupDefaultOrderData();

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/orders/nonexistent-order-id",
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("ORDER_NOT_FOUND");
      expect(body.error.message).toBe("Nie znaleziono zlecenia.");
    });

    it("zwraca 404 dla zlecenia z innego workspace'u", async () => {
      const { token: token1 } = await setupDefaultOrderData();
      const { workspace: workspace2, user: user2 } = await createStaffUser(prisma, {
        workspaceSlug: "other-clinic",
        workspaceName: "Inna Klinika",
        login: "other.clinic",
        password: "OtherPassword123!"
      });

      // Manually create an order in the other workspace
      const otherPatient = await createTestPatient(prisma, {
        workspaceId: workspace2.id,
        firstName: "Obca",
        lastName: "Osoba",
        pesel: "85010112347",
        birthDate: "1985-01-01",
        gender: "FEMALE"
      });

      const otherOrder = await prisma.order.create({
        data: {
          workspaceId: workspace2.id,
          patientId: otherPatient.id,
          createdByUserId: user2.id,
          priority: "ROUTINE",
          status: "DRAFT"
        }
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${otherOrder.id}`,
        headers: { authorization: `Bearer ${token1}` }
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("ORDER_NOT_FOUND");
    });

    it("nie zawiera workspaceId w odpowiedzi", async () => {
      const { token, patientId, tests } = await setupDefaultOrderData();

      const createResponse = await createOrder(token, {
        patientId,
        priority: "ROUTINE",
        tests: [{ medicalTestId: tests.CRP.id }]
      });
      const orderId = JSON.parse(createResponse.body).id;

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${orderId}`,
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.workspaceId).toBeUndefined();
      expect(body.patient.workspaceId).toBeUndefined();
    });
  });

  // Helper functions
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

  async function createOrder(token: string, payload: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: "/api/v1/orders",
      headers: { authorization: `Bearer ${token}` },
      payload
    });
  }
});
