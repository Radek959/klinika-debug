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
  await prisma.userSession.deleteMany();
  await prisma.patient.deleteMany();
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
