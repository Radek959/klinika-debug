import { createPrismaClient } from "../apps/api/src/common/prisma/prisma-client.factory";
import { seedDatabase } from "../apps/api/src/common/prisma/seed-database";

const prisma = createPrismaClient();

seedDatabase(prisma)
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
