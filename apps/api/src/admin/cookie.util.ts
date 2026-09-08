/**
 * Minimalne, ręczne parsowanie i budowanie nagłówka `Cookie`/`Set-Cookie`.
 *
 * Panel `/admin` jest jedynym miejscem w aplikacji potrzebującym ciasteczka
 * sesyjnego, więc celowo nie dodajemy nowej zależności (`@fastify/cookie`)
 * tylko dla jednego, prostego, podpisanego tokenu — to najmniejsza zmiana
 * wystarczająca do zaimplementowania sesji panelu prowadzącego.
 */
export function parseCookies(header: string | string[] | undefined): Record<string, string> {
  const raw = Array.isArray(header) ? header.join("; ") : header;
  if (!raw) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!name) {
      continue;
    }
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = value;
    }
  }
  return result;
}

export interface CookieOptions {
  maxAgeSeconds?: number;
  path?: string;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  secure?: boolean;
}

export function buildSetCookie(name: string, value: string, options: CookieOptions): string {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  if (options.path) {
    segments.push(`Path=${options.path}`);
  }
  if (options.maxAgeSeconds !== undefined) {
    segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`);
  }
  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }
  if (options.httpOnly) {
    segments.push("HttpOnly");
  }
  if (options.secure) {
    segments.push("Secure");
  }
  return segments.join("; ");
}
