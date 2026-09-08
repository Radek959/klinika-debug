import { createPrismaClient } from "../apps/api/src/common/prisma/prisma-client.factory";
import { provisionWorkshopWorkspaces } from "../apps/api/src/common/prisma/seed-workshop";
import { WORKSHOP_DEFAULT_PARTICIPANTS } from "../apps/api/src/common/prisma/workshop-workspaces";

const prisma = createPrismaClient();

provisionWorkshopWorkspaces(prisma, readParticipantCount())
  .then(async (result) => {
    console.log(
      `Przygotowano ${result.participantCount} workspace'ów warsztatowych: ${result.workspaceSlugs.join(", ")}.`
    );
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

function readParticipantCount(): number {
  const arg = process.argv.find((value) => value.startsWith("--participants="));
  if (!arg) {
    return WORKSHOP_DEFAULT_PARTICIPANTS;
  }

  const rawValue = arg.slice("--participants=".length);
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `Niepoprawna wartość --participants: "${rawValue}". Podaj dodatnią liczbę całkowitą.`
    );
  }

  return parsed;
}
