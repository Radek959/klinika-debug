import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

export function configureTestEnvironment() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL musi wskazywać oddzielną testową bazę MySQL."
    );
  }

  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV ??= "test";
  process.env.PORT ??= "3000";
  process.env.SESSION_TOKEN_PEPPER ??= "test-session-pepper";
}

export async function resetTestDatabase(prisma: PrismaClient) {
  await prisma.sample.deleteMany();
  await prisma.orderTest.deleteMany();
  await prisma.order.deleteMany();
  await prisma.userSession.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.medicalTestRequiredField.deleteMany();
  await prisma.testParameter.deleteMany();
  await prisma.medicalTest.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();
}

export async function createStaffUser(
  prisma: PrismaClient,
  input: {
    workspaceSlug: string;
    workspaceName: string;
    login: string;
    password: string;
  }
) {
  const workspace = await prisma.workspace.create({
    data: {
      slug: input.workspaceSlug,
      name: input.workspaceName
    }
  });

  const user = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      login: input.login,
      displayName: `Personel ${input.workspaceName}`,
      role: "STAFF",
      passwordHash: await argon2.hash(input.password, {
        type: argon2.argon2id
      })
    },
    include: {
      workspace: true
    }
  });

  return { workspace, user };
}

export async function createTestPatient(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    firstName: string;
    lastName: string;
    identifierType?: "PESEL" | "OTHER_DOCUMENT";
    pesel?: string;
    documentType?: string;
    documentNumber?: string;
    documentCountry?: string;
    birthDate?: string;
    gender?: "FEMALE" | "MALE";
    phone?: string;
    email?: string;
    active?: boolean;
  }
) {
  return prisma.patient.create({
    data: {
      workspaceId: input.workspaceId,
      firstName: input.firstName,
      lastName: input.lastName,
      identifierType: input.identifierType ?? "PESEL",
      pesel: input.pesel ?? null,
      documentType: input.documentType ?? null,
      documentNumber: input.documentNumber ?? null,
      documentCountry: input.documentCountry ?? null,
      birthDate: new Date(`${input.birthDate ?? "1990-01-01"}T00:00:00.000Z`),
      gender: input.gender ?? "FEMALE",
      phone: input.phone ?? null,
      email: input.email ?? null,
      active: input.active ?? true
    }
  });
}
