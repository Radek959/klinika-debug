import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ApiErrorException } from "../common/errors/api-error.exception";
import { AdminSessionService } from "./admin-session.service";
import { parseCookies } from "./cookie.util";

/**
 * Uwierzytelnienie panelu `/admin`, celowo osobne od `AuthGuard` kont STAFF.
 * Nie ma tu żadnej roli ani uprawnienia — jest tylko ważne albo nieważne
 * ciasteczko sesji prowadzącego.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly adminSession: AdminSessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const cookies = parseCookies(request.headers.cookie);
    const token = cookies[this.adminSession.cookieName];

    if (!this.adminSession.verifyToken(token)) {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        "ADMIN_AUTHENTICATION_REQUIRED",
        "Wymagane jest zalogowanie do panelu prowadzącego."
      );
    }

    return true;
  }
}
