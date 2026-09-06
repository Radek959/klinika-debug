import * as argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../src/common/prisma/prisma-client.factory";
import { seedDatabase } from "../src/common/prisma/seed-database";
import { configureTestEnvironment, resetTestDatabase } from "./database";

describe("database seed", () => {
  let prisma: PrismaClient;
  const originalSeedPassword = process.env.SEED_STAFF_PASSWORD;

  beforeAll(() => {
    configureTestEnvironment();
    process.env.SEED_STAFF_PASSWORD = "SeedTestowe123!";
    prisma = createPrismaClient();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    if (originalSeedPassword === undefined) {
      delete process.env.SEED_STAFF_PASSWORD;
    } else {
      process.env.SEED_STAFF_PASSWORD = originalSeedPassword;
    }
    await prisma.$disconnect();
  });

  it("tworzy syntetyczny workspace i konto STAFF z hasłem z konfiguracji", async () => {
    await seedDatabase(prisma);
    await seedDatabase(prisma);

    const user = await prisma.user.findUniqueOrThrow({
      where: { login: "staff.demo" },
      include: { workspace: true }
    });

    expect(user.role).toBe("STAFF");
    expect(user.active).toBe(true);
    expect(user.workspace.slug).toBe("klinika-pokazowa");
    expect(user.passwordHash).not.toBe("SeedTestowe123!");
    await expect(
      argon2.verify(user.passwordHash, "SeedTestowe123!")
    ).resolves.toBe(true);

    const patients = await prisma.patient.findMany({
      where: { workspaceId: user.workspace.id },
      include: { guardian: true },
      orderBy: { lastName: "asc" }
    });
    expect(patients).toHaveLength(4);
    expect(patients.map((patient) => patient.pesel).sort()).toEqual([
      "02270803624",
      "18210112349",
      "44051401458",
      null
    ]);
    expect(patients.find((patient) => patient.guardian)?.guardian).toMatchObject({
      firstName: "Karolina",
      email: "karolina.syntetyczna@example.test"
    });

    const medicalTests = await prisma.medicalTest.findMany({
      include: {
        parameters: { orderBy: [{ displayOrder: "asc" }, { code: "asc" }] },
        requiredFields: { orderBy: [{ displayOrder: "asc" }, { code: "asc" }] }
      },
      orderBy: { code: "asc" }
    });
    expect(medicalTests).toHaveLength(5);
    expect(medicalTests.map((test) => test.code)).toEqual([
      "CRP",
      "GLU",
      "MORF",
      "TSH",
      "URINE"
    ]);
    expect(new Set(medicalTests.map((test) => test.code)).size).toBe(5);
    expect(
      medicalTests.map((test) => ({
        code: test.code,
        materialType: test.materialType,
        active: test.active
      }))
    ).toEqual([
      { code: "CRP", materialType: "SERUM", active: true },
      { code: "GLU", materialType: "SERUM", active: true },
      { code: "MORF", materialType: "EDTA_BLOOD", active: true },
      { code: "TSH", materialType: "SERUM", active: true },
      { code: "URINE", materialType: "URINE", active: true }
    ]);

    const morf = medicalTests.find((test) => test.code === "MORF");
    expect(morf?.parameters.map((parameter) => parameter.code)).toEqual([
      "WBC",
      "RBC",
      "HGB",
      "PLT"
    ]);

    const glu = medicalTests.find((test) => test.code === "GLU");
    expect(glu?.parameters).toEqual([
      expect.objectContaining({
        code: "GLU",
        name: "Glukoza",
        valueType: "NUMERIC",
        unit: "mg/dL",
        displayOrder: 1
      })
    ]);
    expect(glu?.requiredFields).toEqual([
      expect.objectContaining({
        code: "PATIENT_PREPARED",
        label: "Potwierdzenie przygotowania pacjenta",
        valueType: "BOOLEAN",
        required: true,
        displayOrder: 1
      })
    ]);
    expect(
      medicalTests
        .filter((test) => test.code !== "GLU")
        .flatMap((test) => test.requiredFields)
    ).toEqual([]);
  });
});
