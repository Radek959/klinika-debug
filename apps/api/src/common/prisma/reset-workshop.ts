import { PrismaClient } from "@prisma/client";
import { isWorkshopWorkspaceSlug, WORKSHOP_SLUG_PREFIX } from "./workshop-workspaces";
import { seedWorkspacePatients } from "./seed-database";

export interface ResetWorkshopOptions {
  /**
   * Bezpiecznik programistyczny: musi być jawnie ustawiony na `true` przez
   * wywołującego (CLI albo przyszły endpoint `/admin`). Sama funkcja nigdy
   * nie zgaduje potwierdzenia — brak jawnej zgody jest błędem.
   */
  confirm: boolean;
}

export interface ResetWorkshopResult {
  resetWorkspaceSlugs: string[];
}

/**
 * Resetuje dane WSZYSTKICH workspace'ów warsztatowych (i tylko ich) do
 * deterministycznego stanu początkowego.
 *
 * Bezpieczeństwo:
 * - workspace'y warsztatowe są identyfikowane wyłącznie po `slug` pasującym
 *   do wzorca `warsztat-NN` (`isWorkshopWorkspaceSlug`) — funkcja nigdy nie
 *   zgaduje "wszystko poza demo" i nigdy nie używa `deleteMany({})` bez
 *   warunku `workspaceId`;
 * - `klinika-pokazowa` i jakikolwiek inny workspace spoza tego wzorca nigdy
 *   nie są dotykane;
 * - wymaga jawnego `options.confirm === true` — brak potwierdzenia rzuca
 *   błąd zamiast wykonać reset;
 * - workspace'y i konta `testerXX` NIE są usuwane, tylko ich dane zależne;
 * - katalog badań (`MedicalTest` i powiązane) jest globalny i nie jest
 *   ruszany przez reset workspace'ów;
 * - aktywne sesje uczestników workspace'ów warsztatowych są unieważniane
 *   (ustawiane `revokedAt`), więc po reset uczestnik musi zalogować się
 *   ponownie — to akceptowalny, przewidywalny efekt uboczny resetu, a nie
 *   błąd.
 *
 * Kasowanie danych zależnych respektuje kolejność kluczy obcych (najpierw
 * dane zależne od zlecenia/pacjenta, na końcu sami pacjenci), żeby nie
 * osierocić żadnego wiersza.
 */
export async function resetWorkshopWorkspaces(
  client: PrismaClient,
  options: ResetWorkshopOptions
): Promise<ResetWorkshopResult> {
  if (options.confirm !== true) {
    throw new Error(
      "Reset danych warsztatowych wymaga jawnego potwierdzenia (confirm: true)."
    );
  }

  const workshopWorkspaces = await client.workspace.findMany({
    where: { slug: { startsWith: WORKSHOP_SLUG_PREFIX } },
    select: { id: true, slug: true }
  });
  const workspaceIds = workshopWorkspaces
    .filter((workspace) => isWorkshopWorkspaceSlug(workspace.slug))
    .map((workspace) => workspace.id);

  if (workspaceIds.length === 0) {
    return { resetWorkspaceSlugs: [] };
  }

  const workspaceScope = { workspaceId: { in: workspaceIds } };

  await client.$transaction(async (tx) => {
    const users = await tx.user.findMany({
      where: workspaceScope,
      select: { id: true }
    });
    const userIds = users.map((user) => user.id);

    await tx.userSession.updateMany({
      where: { userId: { in: userIds }, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    await tx.orderHistory.deleteMany({ where: workspaceScope });
    await tx.processedLabEvent.deleteMany({ where: workspaceScope });
    await tx.labSendRetryJob.deleteMany({ where: workspaceScope });
    await tx.labJob.deleteMany({ where: workspaceScope });
    await tx.result.deleteMany({ where: workspaceScope });
    await tx.idempotencyKey.deleteMany({ where: workspaceScope });
    await tx.sample.deleteMany({ where: workspaceScope });
    await tx.orderTest.deleteMany({ where: workspaceScope });
    await tx.order.deleteMany({ where: workspaceScope });
    await tx.guardian.deleteMany({ where: workspaceScope });
    await tx.patient.deleteMany({ where: workspaceScope });

    for (const workspace of workshopWorkspaces) {
      if (!isWorkshopWorkspaceSlug(workspace.slug)) {
        continue;
      }
      await seedWorkspacePatients(tx, workspace.id);
    }
  });

  return {
    resetWorkspaceSlugs: workshopWorkspaces
      .filter((workspace) => isWorkshopWorkspaceSlug(workspace.slug))
      .map((workspace) => workspace.slug)
  };
}
