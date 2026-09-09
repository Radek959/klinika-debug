import { PrismaClient } from "@prisma/client";
import { isWorkshopWorkspaceSlug, WORKSHOP_SLUG_PREFIX } from "./workshop-workspaces";
import { seedWorkspacePatients } from "./seed-database";
import { DEFAULT_CONTROLLED_BUG } from "../../workshop-config/controlled-bug";
import { DEFAULT_LAB_DELAY_MS } from "../../workshop-config/lab-delay";
import { DEFAULT_LAB_SIMULATOR_SCENARIO } from "../../lab-simulator/lab-simulator-scenario";

/**
 * Musi być zgodne z `CONFIG_ROW_ID` w `WorkshopConfigService` i
 * `ensure-workshop-config.ts` — jeden, jednowierszowy singleton
 * `workshop_config`.
 */
const WORKSHOP_CONFIG_ROW_ID = "singleton";

export interface ResetWorkshopOptions {
  /**
   * Bezpiecznik programistyczny: musi być jawnie ustawiony na `true` przez
   * wywołującego (CLI albo endpoint `/admin`). Sama funkcja nigdy nie
   * zgaduje potwierdzenia — brak jawnej zgody jest błędem.
   */
  confirm: boolean;
}

export interface ResetWorkshopResult {
  resetWorkspaceSlugs: string[];
}

export interface ResetSingleWorkshopWorkspaceOptions {
  /** Ten sam bezpiecznik jak w {@link ResetWorkshopOptions.confirm}. */
  confirm: boolean;
  /** Musi pasować do wzorca `warsztat-NN` ({@link isWorkshopWorkspaceSlug}). */
  workspaceSlug: string;
}

export interface ResetSingleWorkshopWorkspaceResult {
  resetWorkspaceSlug: string;
}

/**
 * Rzucany WYŁĄCZNIE wtedy, gdy `workspaceSlug` ma poprawny format `warsztat-NN`,
 * ale taki workspace faktycznie nie istnieje w bazie. Odróżnia ten jeden,
 * bezpieczny do zmapowania na HTTP 404 przypadek od każdego innego błędu
 * (DB, transakcja, revoke sesji, reseeding) — te pozostałe mają propagować
 * jako normalne błędy serwera, a nie zostać cicho zamaskowane jako "nie
 * istnieje".
 */
export class WorkshopWorkspaceNotFoundError extends Error {
  constructor(readonly workspaceSlug: string) {
    super(`Workspace warsztatowy "${workspaceSlug}" nie istnieje.`);
    this.name = "WorkshopWorkspaceNotFoundError";
  }
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
 *   błąd;
 * - globalna konfiguracja warsztatu (`workshop_config`: `labScenario` +
 *   `controlledBug` + `labDelayMs`) jest przywracana do stanu domyślnego
 *   (`SUCCESS` + `CLEAN` + `300000`) — zawsze, nawet gdy nie istnieje żaden
 *   workspace warsztatowy do zresetowania. To JEDYNE, współdzielone źródło
 *   logiki globalnego resetu: wywołuje je zarówno `npm run workshop:reset`
 *   (osobny proces CLI, `prisma/workshop-reset.ts`) jak i `POST
 *   /admin/api/reset`, więc oba sposoby resetu środowiska są równoważne.
 *   `WorkshopConfigService` celowo nie cache'uje konfiguracji w pamięci
 *   procesu — dzięki temu ten bezpośredni zapis do wiersza `workshop_config`
 *   z osobnego procesu CLI jest natychmiast widoczny w już uruchomionym API,
 *   bez restartu procesu (patrz `workshop-config.service.ts`).
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
  const targetWorkspaces = workshopWorkspaces.filter((workspace) =>
    isWorkshopWorkspaceSlug(workspace.slug)
  );

  await resetWorkspacesData(client, targetWorkspaces, { resetGlobalConfig: true });

  return {
    resetWorkspaceSlugs: targetWorkspaces.map((workspace) => workspace.slug)
  };
}

/**
 * Resetuje dane WYŁĄCZNIE JEDNEGO workspace'u warsztatowego wskazanego przez
 * `workspaceSlug`, do tego samego deterministycznego stanu początkowego jak
 * {@link resetWorkshopWorkspaces}. Pozostałe workspace'y warsztatowe (i
 * `klinika-pokazowa`) nie są w żaden sposób dotknięte — przydatne do
 * przywrócenia jednego uczestnika bez resetowania całej grupy.
 *
 * Te same zasady bezpieczeństwa jak {@link resetWorkshopWorkspaces}: wymaga
 * `options.confirm === true`, `workspaceSlug` musi pasować do wzorca
 * `warsztat-NN` ({@link isWorkshopWorkspaceSlug}), a workspace i konto
 * `testerXX` nie są usuwane — tylko ich dane zależne.
 */
export async function resetSingleWorkshopWorkspace(
  client: PrismaClient,
  options: ResetSingleWorkshopWorkspaceOptions
): Promise<ResetSingleWorkshopWorkspaceResult> {
  if (options.confirm !== true) {
    throw new Error(
      "Reset danych warsztatowych wymaga jawnego potwierdzenia (confirm: true)."
    );
  }
  if (!isWorkshopWorkspaceSlug(options.workspaceSlug)) {
    throw new Error(
      `Nieprawidłowy slug workspace'u warsztatowego: "${options.workspaceSlug}".`
    );
  }

  const workspace = await client.workspace.findUnique({
    where: { slug: options.workspaceSlug },
    select: { id: true, slug: true }
  });
  if (!workspace) {
    throw new WorkshopWorkspaceNotFoundError(options.workspaceSlug);
  }

  // Reset jednego uczestnika NIGDY nie dotyka globalnej konfiguracji
  // (`workshop_config`) — to świadoma różnica względem
  // `resetWorkshopWorkspaces` (patrz jego docstring).
  await resetWorkspacesData(client, [workspace], { resetGlobalConfig: false });

  return { resetWorkspaceSlug: workspace.slug };
}

async function resetWorkspacesData(
  client: PrismaClient,
  workspaces: Array<{ id: string; slug: string }>,
  options: { resetGlobalConfig: boolean }
): Promise<void> {
  const workspaceIds = workspaces.map((workspace) => workspace.id);
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

    for (const workspace of workspaces) {
      await seedWorkspacePatients(tx, workspace.id);
    }

    if (options.resetGlobalConfig) {
      await tx.workshopConfig.upsert({
        where: { id: WORKSHOP_CONFIG_ROW_ID },
        create: {
          id: WORKSHOP_CONFIG_ROW_ID,
          labScenario: DEFAULT_LAB_SIMULATOR_SCENARIO,
          controlledBug: DEFAULT_CONTROLLED_BUG,
          labDelayMs: DEFAULT_LAB_DELAY_MS
        },
        update: {
          labScenario: DEFAULT_LAB_SIMULATOR_SCENARIO,
          controlledBug: DEFAULT_CONTROLLED_BUG,
          labDelayMs: DEFAULT_LAB_DELAY_MS
        }
      });
    }
  });
}
