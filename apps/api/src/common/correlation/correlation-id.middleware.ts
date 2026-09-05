import { Injectable, NestMiddleware } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  CORRELATION_ID_HEADER,
  resolveCorrelationId
} from "./correlation-id";

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: FastifyRequest, reply: FastifyReply, next: () => void) {
    const incoming = request.headers["x-correlation-id"];
    const correlationId = resolveCorrelationId({
      "x-correlation-id": incoming
    });

    request.correlationId = correlationId;
    if (typeof reply.header === "function") {
      reply.header(CORRELATION_ID_HEADER, correlationId);
    } else if ("setHeader" in reply && typeof reply.setHeader === "function") {
      reply.setHeader(CORRELATION_ID_HEADER, correlationId);
    }
    next();
  }
}
