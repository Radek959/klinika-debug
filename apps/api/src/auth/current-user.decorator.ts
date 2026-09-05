import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedUser } from "@klinika/api-contracts";
import type { FastifyRequest } from "fastify";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!request.user) {
      throw new Error("Brak użytkownika w kontekście requestu.");
    }
    return request.user;
  }
);
