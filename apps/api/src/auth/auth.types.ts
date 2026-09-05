import type { User, Workspace } from "@prisma/client";

export type UserWithWorkspace = User & { workspace: Workspace };
