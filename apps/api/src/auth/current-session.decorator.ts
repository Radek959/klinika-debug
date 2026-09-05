import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

export const CurrentSessionId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!request.sessionId) {
      throw new Error("Brak sesji w kontekście requestu.");
    }
    return request.sessionId;
  }
);
