export const SESSION_IDLE_TIMEOUT_MINUTES = 60;

export function calculateSessionExpiry(lastActivityAt: Date): Date {
  return new Date(
    lastActivityAt.getTime() + SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000
  );
}

export function isSessionActive(
  now: Date,
  expiresAt: Date,
  revokedAt: Date | null
): boolean {
  return revokedAt === null && expiresAt.getTime() > now.getTime();
}
