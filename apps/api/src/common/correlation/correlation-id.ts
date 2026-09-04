import { randomUUID } from "node:crypto";

export const CORRELATION_ID_HEADER = "X-Correlation-ID";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveCorrelationId(
  headers: Record<string, string | string[] | undefined>,
  existing?: string
) {
  if (existing) {
    return existing;
  }

  const incoming =
    headers["x-correlation-id"] ?? headers[CORRELATION_ID_HEADER];
  const requestedId = Array.isArray(incoming) ? incoming[0] : incoming;

  return requestedId && UUID_PATTERN.test(requestedId)
    ? requestedId
    : randomUUID();
}
