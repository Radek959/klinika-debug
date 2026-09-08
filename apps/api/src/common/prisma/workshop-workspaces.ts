/**
 * Wspólne, deterministyczne definicje workspace'ów i kont warsztatowych.
 *
 * Ten moduł jest jedynym źródłem prawdy o tym, co jest workspace'em
 * warsztatowym (`slug` zaczynający się od `WORKSHOP_SLUG_PREFIX` i pasujący
 * do wzorca dwucyfrowego numeru uczestnika). Provisioning i reset korzystają
 * z tych samych helperów, żeby reset nie mógł dryfować od listy workspace'ów
 * faktycznie tworzonych przez provisioning.
 */

export const WORKSHOP_SLUG_PREFIX = "warsztat-";
export const WORKSHOP_LOGIN_PREFIX = "tester";
export const WORKSHOP_DEFAULT_PARTICIPANTS = 15;
export const WORKSHOP_MAX_PARTICIPANTS = 99;

const WORKSHOP_SLUG_PATTERN = /^warsztat-(\d{2})$/;

export interface WorkshopParticipant {
  index: number;
  slug: string;
  name: string;
  login: string;
}

export function getWorkshopParticipantSlug(index: number): string {
  return `${WORKSHOP_SLUG_PREFIX}${formatParticipantNumber(index)}`;
}

export function getWorkshopParticipantName(index: number): string {
  return `Klinika Warsztatowa ${formatParticipantNumber(index)}`;
}

export function getWorkshopParticipantLogin(index: number): string {
  return `${WORKSHOP_LOGIN_PREFIX}${formatParticipantNumber(index)}`;
}

export function buildWorkshopParticipants(
  participantCount: number
): WorkshopParticipant[] {
  assertValidParticipantCount(participantCount);

  return Array.from({ length: participantCount }, (_, position) => {
    const index = position + 1;
    return {
      index,
      slug: getWorkshopParticipantSlug(index),
      name: getWorkshopParticipantName(index),
      login: getWorkshopParticipantLogin(index)
    };
  });
}

export function isWorkshopWorkspaceSlug(slug: string): boolean {
  return WORKSHOP_SLUG_PATTERN.test(slug);
}

export function assertValidParticipantCount(
  participantCount: number
): asserts participantCount is number {
  if (
    !Number.isInteger(participantCount) ||
    participantCount < 1 ||
    participantCount > WORKSHOP_MAX_PARTICIPANTS
  ) {
    throw new Error(
      `Liczba uczestników musi być liczbą całkowitą z zakresu 1-${WORKSHOP_MAX_PARTICIPANTS}.`
    );
  }
}

export function getWorkshopStaffPassword(): string {
  const password = process.env.WORKSHOP_STAFF_PASSWORD;
  if (password) {
    return password;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "WORKSHOP_STAFF_PASSWORD jest wymagane podczas warsztatowego provisioningu w produkcji."
    );
  }

  return "WarsztatTestowe123!";
}

function formatParticipantNumber(index: number): string {
  return String(index).padStart(2, "0");
}
