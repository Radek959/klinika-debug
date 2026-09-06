import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ApiErrorException } from "../common/errors/api-error.exception";

const WEBHOOK_SECRET_HEADER = "x-lab-webhook-secret";

@Injectable()
export class LabWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const expected = process.env.LAB_WEBHOOK_SECRET;
    const provided = request.headers[WEBHOOK_SECRET_HEADER];

    if (!expected || provided !== expected) {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        "LAB_WEBHOOK_UNAUTHORIZED",
        "Nieprawidłowy albo brakujący sekret webhooka laboratorium."
      );
    }

    return true;
  }
}
