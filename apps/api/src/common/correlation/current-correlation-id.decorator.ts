import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { resolveCorrelationId } from "./correlation-id";

export const CurrentCorrelationId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    // Fallback zamiast rzucania błędu: middleware powinno już ustawić correlationId,
    // ale request obsłużony poza normalnym potokiem (np. w testach) nie może zwrócić 500.
    return resolveCorrelationId(request.headers, request.correlationId);
  }
);
