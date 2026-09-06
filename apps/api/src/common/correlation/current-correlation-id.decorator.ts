import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

export const CurrentCorrelationId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!request.correlationId) {
      throw new Error("Brak correlationId w kontekście requestu.");
    }
    return request.correlationId;
  }
);
