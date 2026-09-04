import { Injectable, NestMiddleware } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: FastifyRequest, reply: FastifyReply, next: () => void) {
    const incoming = request.headers["x-correlation-id"];
    const requestedId = Array.isArray(incoming) ? incoming[0] : incoming;
    const correlationId =
      requestedId && UUID_PATTERN.test(requestedId) ? requestedId : randomUUID();

    request.correlationId = correlationId;
    if (typeof reply.header === "function") {
      reply.header("X-Correlation-ID", correlationId);
    } else if ("setHeader" in reply && typeof reply.setHeader === "function") {
      reply.setHeader("X-Correlation-ID", correlationId);
    }
    next();
  }
}
