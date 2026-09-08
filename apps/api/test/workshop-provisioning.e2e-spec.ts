import * as argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../src/common/prisma/prisma-client.factory";
import { seedDatabase } from "../src/common/prisma/seed-database";
import { provisionWorkshopWorkspaces } from "../src/common/prisma/seed-workshop";
import { configureTestEnvironment, resetTestDatabase } from "./database";

describe("workshop provisioning", () => {
  let prisma: PrismaClient;
  const originalWorkshopPassword = process.env.WORKSHOP_STAFF_PASSWORD;
  const originalSeedPassword = process.env.SEED_STAFF_PASSWORD;

  beforeAll(() => {
    configureTestEnvironment();
    process.env.WORKSHOP_STAFF_PASSWORD = "WarsztatTestowe123!";
    process.env.SEED_STAFF_PASSWORD = "SeedTestowe123!";
    prisma = createPrismaClient();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    if (originalWorkshopPassword === undefined) {
      delete process.env.WORKSHOP_STAFF_PASSWORD;
    } else {
      process.env.WORKSHOP_STAFF_PASSWORD = originalWorkshopPassword;
    }
    if (originalSeedPassword === undefined) {
      delete process.env.SEED_STAFF_PASSWORD;
    } else {
      process.env.SEED_STAFF_PASSWORD = originalSeedPassword;
    }
    await prisma.$disconnect();
  });

  it("tworzy żądaną liczbę workspace'ów i kont testerXX wskazujących właściwy workspace", async () => {
    const result = await provisionWorkshopWorkspaces(prisma, 3);

    expect(result.participantCount).toBe(3);
    expect(result.workspaceSlugs).toEqual([
      "warsztat-01",
      "warsztat-02",
      "warsztat-03"
    ]);
    expect(result.logins).toEqual(["tester01", "tester02", "tester03"]);

    const workspaces = await prisma.workspace.findMany({
      where: { slug: { in: result.workspaceSlugs } },
      orderBy: { slug: "asc" }
    });
    expect(workspaces).toHaveLength(3);
    expect(workspaces.map((workspace) => workspace.name)).toEqual([
      "Klinika Warsztatowa 01",
      "Klinika Warsztatowa 02",
      "Klinika Warsztatowa 03"
    ]);

    for (const workspace of workspaces) {
      const expectedLogin = `tester${workspace.slug.slice(-2)}`;
      const user = await prisma.user.findUniqueOrThrow({
        where: { login: expectedLogin }
      });
      expect(user.workspaceId).toBe(workspace.id);
      expect(user.role).toBe("STAFF");
      expect(user.active).toBe(true);
      await expect(
        argon2.verify(user.passwordHash, "WarsztatTestowe123!")
      ).resolves.toBe(true);

      const patients = await prisma.patient.findMany({
        where: { workspaceId: workspace.id }
      });
      expect(patients.length).toBeGreaterThan(0);
    }
  });

  it("jest idempotentny: ponowne wywołanie nie tworzy duplikatów", async () => {
    await provisionWorkshopWorkspaces(prisma, 2);
    await provisionWorkshopWorkspaces(prisma, 2);

    await expect(
      prisma.workspace.count({ where: { slug: { startsWith: "warsztat-" } } })
    ).resolves.toBe(2);
    await expect(
      prisma.user.count({ where: { login: { startsWith: "tester" } } })
    ).resolves.toBe(2);

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { slug: "warsztat-01" }
    });
    await expect(
      prisma.patient.count({ where: { workspaceId: workspace.id } })
    ).resolves.toBe(4);
  });

  it("nie modyfikuje klinika-pokazowa", async () => {
    await seedDatabase(prisma);
    const before = await prisma.user.findUniqueOrThrow({
      where: { login: "staff.demo" }
    });

    await provisionWorkshopWorkspaces(prisma, 5);

    const after = await prisma.user.findUniqueOrThrow({
      where: { login: "staff.demo" }
    });
    expect(after).toEqual(before);
    await expect(
      prisma.workspace.count({ where: { slug: "klinika-pokazowa" } })
    ).resolves.toBe(1);
  });
});
