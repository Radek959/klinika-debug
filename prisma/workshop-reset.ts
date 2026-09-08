import { createPrismaClient } from "../apps/api/src/common/prisma/prisma-client.factory";
import { resetWorkshopWorkspaces } from "../apps/api/src/common/prisma/reset-workshop";

const prisma = createPrismaClient();

/**
 * Bezpiecznik przed przypadkowym uruchomieniem: samo `npm run workshop:reset`
 * bez tej zmiennej środowiskowej zawsze się zatrzymuje. Wymagana jest dokładna
 * wartość `RESET`, np.:
 *
 *   WORKSHOP_RESET_CONFIRM=RESET npm run workshop:reset
 */
const REQUIRED_CONFIRMATION = "RESET";

if (process.env.WORKSHOP_RESET_CONFIRM !== REQUIRED_CONFIRMATION) {
  console.error(
    `Reset danych warsztatowych wymaga potwierdzenia. Uruchom ponownie z: WORKSHOP_RESET_CONFIRM=${REQUIRED_CONFIRMATION} npm run workshop:reset`
  );
  process.exit(1);
}

resetWorkshopWorkspaces(prisma, { confirm: true })
  .then(async (result) => {
    if (result.resetWorkspaceSlugs.length === 0) {
      console.log("Nie znaleziono żadnego workspace'u warsztatowego do zresetowania.");
    } else {
      console.log(
        `Zresetowano dane workspace'ów warsztatowych: ${result.resetWorkspaceSlugs.join(", ")}.`
      );
    }
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
