import { PrismaClient } from "@prisma/client";
import { isWorkshopWorkspaceSlug, WORKSHOP_SLUG_PREFIX } from "./workshop-workspaces";

export interface WorkshopWorkspaceSummary {
  slug: string;
  name: string;
  /** Login konta `testerXX` tego workspace'u (jeden uczestnik = jeden workspace). */
  login: string;
}

/**
 * Lista workspace'ów warsztatowych dla panelu `/admin` — WYŁĄCZNIE `slug`,
 * `name` i login konta uczestnika, żeby prowadzący mógł wybrać workspace do
 * resetu. Celowo NIE zwraca danych pacjentów, haszy hasła, sesji ani żadnych
 * innych sekretów (AGENTS.md).
 */
export async function listWorkshopWorkspaces(
  client: PrismaClient
): Promise<WorkshopWorkspaceSummary[]> {
  const workspaces = await client.workspace.findMany({
    where: { slug: { startsWith: WORKSHOP_SLUG_PREFIX } },
    select: {
      slug: true,
      name: true,
      users: { select: { login: true }, take: 1, orderBy: { createdAt: "asc" } }
    },
    orderBy: { slug: "asc" }
  });

  return workspaces
    .filter((workspace) => isWorkshopWorkspaceSlug(workspace.slug))
    .map((workspace) => ({
      slug: workspace.slug,
      name: workspace.name,
      login: workspace.users[0]?.login ?? ""
    }));
}
