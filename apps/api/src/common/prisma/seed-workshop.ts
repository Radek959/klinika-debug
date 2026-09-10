import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import {
  buildWorkshopParticipants,
  getWorkshopStaffPassword,
  WORKSHOP_DEFAULT_PARTICIPANTS
} from "./workshop-workspaces";
import { seedMedicalTestsCatalog, seedWorkspacePatients } from "./seed-database";

export interface ProvisionWorkshopResult {
  participantCount: number;
  workspaceSlugs: string[];
  logins: string[];
}

/**
 * Tworzy (albo aktualizuje) `participantCount` izolowanych workspace'ów
 * warsztatowych, po jednym koncie `STAFF` w każdym, oraz zasiewa w nich
 * deterministyczne dane startowe.
 *
 * Idempotentne: wielokrotne wywołanie dla tej samej liczby uczestników nie
 * tworzy duplikatów workspace'ów, kont ani pacjentów — wszystko odbywa się
 * przez `upsert` po stabilnych identyfikatorach (`slug`, `login`,
 * identyfikator pacjenta w workspace).
 *
 * Nie modyfikuje `klinika-pokazowa` ani żadnego innego workspace spoza listy
 * wyliczonej przez `buildWorkshopParticipants`.
 */
export async function provisionWorkshopWorkspaces(
  client: PrismaClient,
  participantCount: number = WORKSHOP_DEFAULT_PARTICIPANTS
): Promise<ProvisionWorkshopResult> {
  const participants = buildWorkshopParticipants(participantCount);
  const passwordHash = await argon2.hash(getWorkshopStaffPassword(), {
    type: argon2.argon2id
  });

  await seedMedicalTestsCatalog(client);

  for (const participant of participants) {
    const workspace = await client.workspace.upsert({
      where: { slug: participant.slug },
      update: { name: participant.name },
      create: {
        slug: participant.slug,
        name: participant.name
      }
    });

    await client.user.upsert({
      where: { login: participant.login },
      update: {
        workspaceId: workspace.id,
        displayName: participant.displayName,
        role: "STAFF",
        passwordHash,
        active: true
      },
      create: {
        workspaceId: workspace.id,
        login: participant.login,
        displayName: participant.displayName,
        role: "STAFF",
        passwordHash,
        active: true
      }
    });

    await seedWorkspacePatients(client, workspace.id);
  }

  return {
    participantCount,
    workspaceSlugs: participants.map((participant) => participant.slug),
    logins: participants.map((participant) => participant.login)
  };
}
