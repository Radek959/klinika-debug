export type UserRole = "STAFF";

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
}

export interface AuthenticatedUser {
  id: string;
  login: string;
  displayName: string;
  role: UserRole;
  workspace: WorkspaceSummary;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: AuthenticatedUser;
}

export interface MeResponse {
  user: AuthenticatedUser;
}
