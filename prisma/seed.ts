import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const seedPassword = getSeedStaffPassword();
  const workspace = await prisma.workspace.upsert({
    where: { slug: "klinika-pokazowa" },
    update: { name: "Klinika Pokazowa" },
    create: {
      name: "Klinika Pokazowa",
      slug: "klinika-pokazowa"
    }
  });

  const passwordHash = await argon2.hash(seedPassword, {
    type: argon2.argon2id
  });

  await prisma.user.upsert({
    where: { login: "staff.demo" },
    update: {
      workspaceId: workspace.id,
      displayName: "Personel pokazowy",
      role: "STAFF",
      passwordHash,
      active: true
    },
    create: {
      workspaceId: workspace.id,
      login: "staff.demo",
      displayName: "Personel pokazowy",
      role: "STAFF",
      passwordHash,
      active: true
    }
  });
}

function getSeedStaffPassword(): string {
  const password = process.env.SEED_STAFF_PASSWORD;
  if (password) {
    return password;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SEED_STAFF_PASSWORD jest wymagane podczas produkcyjnego seedowania.");
  }

  return "HasloTestowe123!";
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
