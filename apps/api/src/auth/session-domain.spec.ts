import {
  calculateSessionExpiry,
  isSessionActive,
  SESSION_IDLE_TIMEOUT_MINUTES
} from "@klinika/domain";

describe("session domain rules", () => {
  it("ustawia wygaśnięcie sesji po 60 minutach bezczynności", () => {
    const lastActivityAt = new Date("2026-09-04T12:00:00.000Z");

    expect(calculateSessionExpiry(lastActivityAt)).toEqual(
      new Date("2026-09-04T13:00:00.000Z")
    );
    expect(SESSION_IDLE_TIMEOUT_MINUTES).toBe(60);
  });

  it("uznaje sesję za nieaktywną po wygaśnięciu albo unieważnieniu", () => {
    const now = new Date("2026-09-04T12:30:00.000Z");

    expect(
      isSessionActive(now, new Date("2026-09-04T13:00:00.000Z"), null)
    ).toBe(true);
    expect(
      isSessionActive(now, new Date("2026-09-04T12:00:00.000Z"), null)
    ).toBe(false);
    expect(
      isSessionActive(
        now,
        new Date("2026-09-04T13:00:00.000Z"),
        new Date("2026-09-04T12:10:00.000Z")
      )
    ).toBe(false);
  });
});
