import {
  canScheduleLabSendRetry,
  computeLabSendRetryExecuteAt,
  computeLabSendRetryFailureExecuteAt,
  computeRetryAfterSeconds,
  getLabSendRetryDelaySeconds,
  FIRST_LAB_SEND_ATTEMPT_NUMBER,
  LAB_RATE_LIMITED_ERROR_CODE,
  LAB_RATE_LIMITED_MESSAGE,
  LAB_SEND_RETRY_DELAYS_SECONDS,
  LAB_SEND_RETRY_FAILURE_BACKOFF_SECONDS,
  LAB_SEND_RETRY_FAILURE_MESSAGE,
  LAB_SEND_RETRY_EXHAUSTED_REASON,
  LAB_SERVER_ERROR_CODE,
  LAB_SERVER_ERROR_MESSAGE,
  MAX_LAB_SEND_RETRY_COUNT
} from "./lab-send-retry";

describe("harmonogram ponowień wysyłki do laboratorium", () => {
  it("odwzorowuje harmonogram 15/30/60 sekund z dokumentacji produktowej", () => {
    expect(LAB_SEND_RETRY_DELAYS_SECONDS).toEqual([15, 30, 60]);
    expect(MAX_LAB_SEND_RETRY_COUNT).toBe(3);
  });

  it("przypisuje opóźnienia kolejnym próbom wysyłki", () => {
    expect(getLabSendRetryDelaySeconds(2)).toBe(15);
    expect(getLabSendRetryDelaySeconds(3)).toBe(30);
    expect(getLabSendRetryDelaySeconds(4)).toBe(60);
  });

  it("nie planuje opóźnienia dla pierwszej, ręcznej próby", () => {
    expect(FIRST_LAB_SEND_ATTEMPT_NUMBER).toBe(1);
    expect(getLabSendRetryDelaySeconds(FIRST_LAB_SEND_ATTEMPT_NUMBER)).toBeNull();
    expect(canScheduleLabSendRetry(FIRST_LAB_SEND_ATTEMPT_NUMBER)).toBe(false);
  });

  it("zwraca brak opóźnienia po wyczerpaniu harmonogramu", () => {
    expect(getLabSendRetryDelaySeconds(5)).toBeNull();
    expect(canScheduleLabSendRetry(5)).toBe(false);
    expect(canScheduleLabSendRetry(2)).toBe(true);
  });

  it("odrzuca numery prób, które nie są dodatnimi liczbami całkowitymi", () => {
    expect(getLabSendRetryDelaySeconds(0)).toBeNull();
    expect(getLabSendRetryDelaySeconds(-3)).toBeNull();
    expect(getLabSendRetryDelaySeconds(2.5)).toBeNull();
    expect(getLabSendRetryDelaySeconds(Number.NaN)).toBeNull();
  });

  it("wylicza termin pierwszego ponowienia na 15 sekund od podanej chwili", () => {
    const now = new Date("2026-09-07T10:00:00.000Z");

    const executeAt = computeLabSendRetryExecuteAt({ now, attemptNumber: 2 });

    expect(executeAt?.toISOString()).toBe("2026-09-07T10:00:15.000Z");
  });

  it("wylicza terminy kolejnych ponowień z tego samego harmonogramu", () => {
    const now = new Date("2026-09-07T10:00:00.000Z");

    expect(computeLabSendRetryExecuteAt({ now, attemptNumber: 3 })?.toISOString()).toBe(
      "2026-09-07T10:00:30.000Z"
    );
    expect(computeLabSendRetryExecuteAt({ now, attemptNumber: 4 })?.toISOString()).toBe(
      "2026-09-07T10:01:00.000Z"
    );
    expect(computeLabSendRetryExecuteAt({ now, attemptNumber: 5 })).toBeNull();
  });

  it("nie korzysta z zegara wewnętrznego — termin zależy tylko od wejścia", () => {
    const now = new Date("2020-01-01T00:00:00.000Z");

    const first = computeLabSendRetryExecuteAt({ now, attemptNumber: 2 });
    const second = computeLabSendRetryExecuteAt({ now, attemptNumber: 2 });

    expect(first?.toISOString()).toBe(second?.toISOString());
    expect(first?.toISOString()).toBe("2020-01-01T00:00:15.000Z");
  });

  describe("nagłówek Retry-After", () => {
    it("zwraca pełną liczbę sekund do terminu ponowienia", () => {
      expect(
        computeRetryAfterSeconds({
          now: new Date("2026-09-07T10:00:00.000Z"),
          executeAt: new Date("2026-09-07T10:00:15.000Z")
        })
      ).toBe(15);
    });

    it("zaokrągla pozostały czas w górę, żeby klient nie ponowił za wcześnie", () => {
      expect(
        computeRetryAfterSeconds({
          now: new Date("2026-09-07T10:00:00.000Z"),
          executeAt: new Date("2026-09-07T10:00:14.200Z")
        })
      ).toBe(15);
      expect(
        computeRetryAfterSeconds({
          now: new Date("2026-09-07T10:00:00.000Z"),
          executeAt: new Date("2026-09-07T10:00:00.001Z")
        })
      ).toBe(1);
    });

    it("nigdy nie zwraca wartości ujemnej dla terminu z przeszłości", () => {
      expect(
        computeRetryAfterSeconds({
          now: new Date("2026-09-07T10:00:30.000Z"),
          executeAt: new Date("2026-09-07T10:00:15.000Z")
        })
      ).toBe(0);
      expect(
        computeRetryAfterSeconds({
          now: new Date("2026-09-07T10:00:15.000Z"),
          executeAt: new Date("2026-09-07T10:00:15.000Z")
        })
      ).toBe(0);
    });
  });

  describe("odsunięcie zadania po błędzie technicznym wykonania", () => {
    it("definiuje opóźnienie nie krótsze niż najkrótsze ponowienie harmonogramu", () => {
      expect(LAB_SEND_RETRY_FAILURE_BACKOFF_SECONDS).toBe(15);
      expect(LAB_SEND_RETRY_FAILURE_BACKOFF_SECONDS).toBeGreaterThanOrEqual(
        LAB_SEND_RETRY_DELAYS_SECONDS[0]
      );
    });

    it("przesuwa termin wykonania w przyszłość względem przekazanego czasu", () => {
      const now = new Date("2026-09-07T10:00:00.000Z");

      const executeAt = computeLabSendRetryFailureExecuteAt({ now });

      expect(executeAt).toEqual(new Date("2026-09-07T10:00:15.000Z"));
      expect(executeAt.getTime()).toBeGreaterThan(now.getTime());
    });

    it("nie zależy od zegara wewnątrz funkcji", () => {
      const now = new Date("2026-09-07T10:00:00.000Z");

      expect(computeLabSendRetryFailureExecuteAt({ now })).toEqual(
        computeLabSendRetryFailureExecuteAt({ now })
      );
    });

    it("udostępnia stały, bezpieczny komunikat techniczny bez danych wrażliwych", () => {
      expect(LAB_SEND_RETRY_FAILURE_MESSAGE).toBe(
        "Techniczny błąd wykonania zadania ponowienia wysyłki."
      );
      expect(LAB_SEND_RETRY_FAILURE_MESSAGE).not.toMatch(/pesel|barcode|select |at .*\.ts:/i);
    });
  });

  it("udostępnia stały kod i polski komunikat ograniczenia przepustowości", () => {
    expect(LAB_RATE_LIMITED_ERROR_CODE).toBe("LAB_RATE_LIMITED");
    expect(LAB_RATE_LIMITED_MESSAGE).toBe(
      "Laboratorium chwilowo ograniczyło liczbę żądań. Wysyłka zostanie ponowiona automatycznie."
    );
  });

  it("udostępnia stały kod i polski komunikat chwilowej niedostępności laboratorium", () => {
    expect(LAB_SERVER_ERROR_CODE).toBe("LAB_SERVER_ERROR");
    expect(LAB_SERVER_ERROR_MESSAGE).toBe(
      "Laboratorium jest chwilowo niedostępne. Wysyłka zostanie ponowiona automatycznie."
    );
    expect(LAB_SEND_RETRY_EXHAUSTED_REASON).toBe(
      "Automatyczne ponowienia wysyłki do laboratorium zostały wyczerpane."
    );
  });
});
