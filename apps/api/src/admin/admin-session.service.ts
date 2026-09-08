import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Krótki, rozsądny czas życia sesji panelu prowadzącego: 2 godziny.
 * Wystarcza na jeden warsztat, a wygasła sesja wymaga ponownego logowania.
 */
const SESSION_TTL_SECONDS = 2 * 60 * 60;

export const ADMIN_SESSION_COOKIE_NAME = "klinika_admin_session";

/**
 * Sesja panelu `/admin` jest CELOWO niezależna od sesji STAFF
 * (`UserSession`): to osobne, techniczne uwierzytelnienie prowadzącego, a nie
 * uprawnienie konta użytkownika (patrz AGENTS.md, docs/ai/backend-playbook.md).
 *
 * Token jest bezstanowym, podpisanym ciasteczkiem (`<issuedAtMs>.<hmac>`), a
 * nie wierszem w bazie danych — panel `/admin` nie potrzebuje listy aktywnych
 * sesji, odwołania pojedynczej sesji ani audytu logowań, więc dodatkowa
 * tabela byłaby niepotrzebną komplikacją. Podpis (HMAC-SHA256 z
 * `ADMIN_SESSION_SECRET`) chroni przed sfałszowaniem albo wydłużeniem tokenu
 * przez klienta.
 */
@Injectable()
export class AdminSessionService {
  constructor(private readonly configService: ConfigService) {}

  readonly cookieName = ADMIN_SESSION_COOKIE_NAME;
  readonly ttlSeconds = SESSION_TTL_SECONDS;

  createToken(now: Date = new Date()): string {
    const issuedAtMs = String(now.getTime());
    return `${issuedAtMs}.${this.sign(issuedAtMs)}`;
  }

  verifyToken(token: string | undefined, now: Date = new Date()): boolean {
    if (!token) {
      return false;
    }

    const separatorIndex = token.indexOf(".");
    if (separatorIndex === -1) {
      return false;
    }

    const issuedAtRaw = token.slice(0, separatorIndex);
    const signature = token.slice(separatorIndex + 1);
    const issuedAtMs = Number(issuedAtRaw);
    if (!Number.isFinite(issuedAtMs) || !signature) {
      return false;
    }

    const ageMs = now.getTime() - issuedAtMs;
    // Ujemny wiek (token "z przyszłości") jest tak samo nieprawidłowy jak
    // wygasły — chroni przed zegarem klienta ustawionym wstecz/wprzód.
    if (ageMs < 0 || ageMs > SESSION_TTL_SECONDS * 1000) {
      return false;
    }

    return timingSafeEqualStrings(signature, this.sign(issuedAtRaw));
  }

  private sign(payload: string): string {
    const secret = this.configService.getOrThrow<string>("ADMIN_SESSION_SECRET");
    return createHmac("sha256", secret).update(payload).digest("hex");
  }
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  if (bufferA.length === 0 || bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}
