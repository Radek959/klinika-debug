import type { AuthenticatedUser } from "@klinika/api-contracts";

declare module "fastify" {
  interface FastifyRequest {
    correlationId?: string;
    user?: AuthenticatedUser;
    sessionId?: string;
  }
}
