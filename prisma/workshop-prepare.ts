import { createPrismaClient } from "../apps/api/src/common/prisma/prisma-client.factory";
import { provisionWorkshopWorkspaces } from "../apps/api/src/common/prisma/seed-workshop";
import { ensureWorkshopConfigExists } from "../apps/api/src/common/prisma/ensure-workshop-config";
import {
  resolveWorkshopParticipantCount,
  validateWorkshopPrepareEnvironment
} from "../apps/api/src/common/prisma/workshop-prepare-env";

main()
  .then(async (exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

async function main(): Promise<number> {
  validateWorkshopPrepareEnvironment(process.env);
  const participantCount = resolveWorkshopParticipantCount(process.env);

  const prisma = createPrismaClient();
  try {
    const result = await provisionWorkshopWorkspaces(prisma, participantCount);
    await ensureWorkshopConfigExists(prisma);
    printSummary(result);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

function printSummary(result: {
  participantCount: number;
  workspaceSlugs: string[];
  logins: string[];
}): void {
  const firstWorkspace = result.workspaceSlugs[0];
  const lastWorkspace = result.workspaceSlugs[result.workspaceSlugs.length - 1];
  const firstLogin = result.logins[0];
  const lastLogin = result.logins[result.logins.length - 1];

  console.log("Workshop environment ready");
  console.log("");
  console.log(`Participants: ${result.participantCount}`);
  console.log(`Workspaces: ${firstWorkspace} ... ${lastWorkspace}`);
  console.log(`Accounts: ${firstLogin} ... ${lastLogin}`);
  console.log("Medical tests: available");
  console.log("Workshop config: available");
  console.log("");
  console.log("No participant data was reset.");
}
