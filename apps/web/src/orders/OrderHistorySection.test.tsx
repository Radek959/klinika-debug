import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OrderHistoryItem, OrderHistoryListResponse } from "@klinika/api-contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderHistorySection } from "./OrderHistorySection";

describe("OrderHistorySection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("pokazuje stan ładowania, a następnie wpisy z polskimi etykietami", async () => {
    mockHistoryResponse(
      historyResponse([
        historyItem({
          eventType: "ORDER_SENT_TO_LAB",
          actorType: "STAFF",
          actorDisplayName: "Personel pokazowy",
          correlationId: "corr-123",
          previousStatus: "SAMPLE_COLLECTED",
          newStatus: "SENT_TO_LAB",
          details: {
            eventType: "ORDER_SENT_TO_LAB",
            idempotencyKey: "send-order-1",
            correlationId: "corr-123",
            previousStatus: "SAMPLE_COLLECTED",
            newStatus: "SENT_TO_LAB"
          }
        })
      ])
    );

    render(<OrderHistorySection token="token" orderId="order-1" refreshKey={0} />);

    expect(screen.getByText("Ładowanie historii operacji...")).toBeInTheDocument();

    expect(await screen.findByText("Wysłano do laboratorium")).toBeInTheDocument();
    expect(screen.getByText(/Wykonawca: Personel \(Personel pokazowy\)/)).toBeInTheDocument();
    expect(screen.getByText("Zlecenie zostało przekazane do laboratorium.")).toBeInTheDocument();
    expect(screen.getByText("corr-123")).toBeInTheDocument();
    expect(screen.queryByText("ORDER_SENT_TO_LAB")).not.toBeInTheDocument();
  });

  it("pokazuje odrzucenie próbki po polsku, bez surowych enumów", async () => {
    mockHistoryResponse(
      historyResponse([
        historyItem({
          eventType: "LAB_SAMPLE_REJECTED",
          actorType: "LAB",
          actorUserId: null,
          correlationId: "corr-999",
          integrationEventId: "evt-rejected-1",
          previousStatus: "SENT_TO_LAB",
          newStatus: "REJECTED",
          details: {
            eventType: "LAB_SAMPLE_REJECTED",
            eventId: "evt-rejected-1",
            externalOrderId: "EXT-1",
            rejectedSamples: [
              {
                sampleId: "sample-1",
                materialType: "EDTA_BLOOD",
                rejectionCode: "HEMOLYZED",
                rejectionReason: "Próbka zhemolizowana"
              }
            ],
            completedTestCodes: ["CRP"],
            rejectedTestCodes: ["MORF"],
            previousStatus: "SENT_TO_LAB",
            newStatus: "REJECTED"
          }
        })
      ])
    );

    render(<OrderHistorySection token="token" orderId="order-1" refreshKey={0} />);

    expect(
      await screen.findByText("Laboratorium odrzuciło próbkę")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Odrzucone materiały: Krew \(EDTA\) — Próbka zhemolizowana \(HEMOLYZED\)/
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/Badania odrzucone: MORF/)).toBeInTheDocument();
    expect(screen.getByText(/Badania wykonane: CRP/)).toBeInTheDocument();
    expect(
      screen.getByText("Zmiana statusu: Wysłane do laboratorium → Odrzucone")
    ).toBeInTheDocument();
    expect(screen.queryByText("LAB_SAMPLE_REJECTED")).not.toBeInTheDocument();
    expect(screen.queryByText(/SAMPLE_REJECTED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/EDTA_BLOOD/)).not.toBeInTheDocument();
  });

  it("pokazuje wszystkie odrzucone próbki wielomateriałowego zlecenia", async () => {
    mockHistoryResponse(
      historyResponse([
        historyItem({
          eventType: "LAB_SAMPLE_REJECTED",
          actorType: "LAB",
          actorUserId: null,
          integrationEventId: "evt-rejected-all",
          previousStatus: "SENT_TO_LAB",
          newStatus: "REJECTED",
          details: {
            eventType: "LAB_SAMPLE_REJECTED",
            eventId: "evt-rejected-all",
            externalOrderId: "EXT-2",
            rejectedSamples: [
              {
                sampleId: "sample-a",
                materialType: "EDTA_BLOOD",
                rejectionCode: "HEMOLYZED",
                rejectionReason: "Próbka zhemolizowana"
              },
              {
                sampleId: "sample-b",
                materialType: "SERUM",
                rejectionCode: "INSUFFICIENT_VOLUME",
                rejectionReason: "Niewystarczająca objętość próbki"
              }
            ],
            completedTestCodes: [],
            rejectedTestCodes: ["CRP", "MORF"],
            previousStatus: "SENT_TO_LAB",
            newStatus: "REJECTED"
          }
        })
      ])
    );

    render(<OrderHistorySection token="token" orderId="order-1" refreshKey={0} />);

    const description = await screen.findByText(/Odrzucone materiały:/);
    expect(description).toHaveTextContent(
      "Krew (EDTA) — Próbka zhemolizowana (HEMOLYZED)"
    );
    expect(description).toHaveTextContent(
      "Surowica — Niewystarczająca objętość próbki (INSUFFICIENT_VOLUME)"
    );
    expect(screen.getByText(/Badania odrzucone: CRP, MORF/)).toBeInTheDocument();
    expect(screen.queryByText(/Badania wykonane:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/EDTA_BLOOD|SERUM/)).not.toBeInTheDocument();
  });

  it("pokazuje odrzucenie zlecenia przez laboratorium po polsku", async () => {
    mockHistoryResponse(
      historyResponse([
        historyItem({
          eventType: "LAB_ORDER_REJECTED",
          actorType: "LAB",
          actorUserId: null,
          correlationId: "corr-rejected-1",
          previousStatus: "SAMPLE_COLLECTED",
          newStatus: "SAMPLE_COLLECTED",
          details: {
            eventType: "LAB_ORDER_REJECTED",
            rejectionType: "VALIDATION",
            errorCode: "LAB_ORDER_VALIDATION_ERROR",
            fieldErrors: [
              {
                field: "tests",
                code: "LAB_TEST_NOT_SUPPORTED",
                message: "Laboratorium nie obsługuje jednego z wybranych badań."
              }
            ],
            previousStatus: "SAMPLE_COLLECTED",
            newStatus: "SAMPLE_COLLECTED"
          }
        })
      ])
    );

    render(<OrderHistorySection token="token" orderId="order-1" refreshKey={0} />);

    expect(
      await screen.findByText("Laboratorium odrzuciło zlecenie")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Zlecenie nie przeszło walidacji po stronie laboratorium\./)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Laboratorium nie obsługuje jednego z wybranych badań\./)
    ).toBeInTheDocument();
    expect(screen.getByText("corr-rejected-1")).toBeInTheDocument();

    // Odrzucenie nie zmienia statusu, więc oś czasu nie może pokazywać przejścia.
    expect(
      screen.getByText("Status zlecenia bez zmian: Próbki pobrane")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Zmiana statusu:/)).not.toBeInTheDocument();

    // Żadnych surowych enumów ani technicznych kodów w interfejsie.
    expect(screen.queryByText(/LAB_ORDER_REJECTED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/LAB_ORDER_VALIDATION_ERROR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/LAB_TEST_NOT_SUPPORTED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/VALIDATION_ERROR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SAMPLE_COLLECTED/)).not.toBeInTheDocument();
  });

  it("pokazuje ograniczenie przepustowości i automatyczne ponowienie po polsku", async () => {
    mockHistoryResponse(
      historyResponse([
        historyItem({
          eventType: "LAB_SEND_RETRY",
          actorType: "SYSTEM",
          actorUserId: null,
          correlationId: "corr-rate-limit-1",
          previousStatus: "SAMPLE_COLLECTED",
          newStatus: "SENT_TO_LAB",
          details: {
            eventType: "LAB_SEND_RETRY",
            attemptNumber: 2,
            outcome: "ACCEPTED",
            previousStatus: "SAMPLE_COLLECTED",
            newStatus: "SENT_TO_LAB"
          }
        }),
        historyItem({
          eventType: "LAB_RATE_LIMIT_RECEIVED",
          actorType: "LAB",
          actorUserId: null,
          correlationId: "corr-rate-limit-1",
          previousStatus: "SAMPLE_COLLECTED",
          newStatus: "SAMPLE_COLLECTED",
          details: {
            eventType: "LAB_RATE_LIMIT_RECEIVED",
            attemptNumber: 1,
            retryAfterSeconds: 15,
            nextRetryAt: "2026-09-07T10:00:15.000Z",
            previousStatus: "SAMPLE_COLLECTED",
            newStatus: "SAMPLE_COLLECTED"
          }
        })
      ])
    );

    render(<OrderHistorySection token="token" orderId="order-1" refreshKey={0} />);

    expect(
      await screen.findByText("Laboratorium ograniczyło liczbę żądań")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Laboratorium chwilowo ograniczyło liczbę żądań\./)
    ).toBeInTheDocument();
    expect(screen.getByText(/Wysyłka zostanie ponowiona automatycznie\./)).toBeInTheDocument();

    // Ograniczenie nie zmienia statusu zlecenia.
    expect(
      screen.getByText("Status zlecenia bez zmian: Próbki pobrane")
    ).toBeInTheDocument();

    // Automatyczne ponowienie jest oznaczone jako działanie systemu.
    expect(screen.getByText("Automatyczne ponowienie wysyłki")).toBeInTheDocument();
    expect(
      screen.getByText(/Automatyczna próba nr 2 zakończona przyjęciem zlecenia/)
    ).toBeInTheDocument();
    expect(screen.getByText("Wykonawca: System")).toBeInTheDocument();
    expect(
      screen.getByText("Zmiana statusu: Próbki pobrane → Wysłane do laboratorium")
    ).toBeInTheDocument();

    // Żadnych surowych enumów, kodów błędów ani nazwy scenariusza.
    expect(screen.queryByText(/LAB_RATE_LIMIT_RECEIVED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/LAB_SEND_RETRY/)).not.toBeInTheDocument();
    expect(screen.queryByText(/LAB_RATE_LIMITED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/RATE_LIMIT/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SAMPLE_COLLECTED|SENT_TO_LAB/)).not.toBeInTheDocument();
  });

  it("pokazuje zaplanowane ponowienie po błędzie 5xx laboratorium", async () => {
    mockHistoryResponse(
      historyResponse([
        historyItem({
          eventType: "LAB_SEND_RETRY",
          actorType: "LAB",
          actorUserId: null,
          correlationId: "corr-server-error-1",
          previousStatus: "SAMPLE_COLLECTED",
          newStatus: "SAMPLE_COLLECTED",
          details: {
            eventType: "LAB_SEND_RETRY",
            attemptNumber: 1,
            outcome: "SCHEDULED",
            labStatusCode: 503,
            nextAttemptNumber: 2,
            retryAfterSeconds: 15,
            nextRetryAt: "2026-09-07T10:00:15.000Z",
            previousStatus: "SAMPLE_COLLECTED",
            newStatus: "SAMPLE_COLLECTED"
          }
        })
      ])
    );

    render(<OrderHistorySection token="token" orderId="order-1" refreshKey={0} />);

    expect(await screen.findByText("Automatyczne ponowienie wysyłki")).toBeInTheDocument();
    expect(screen.getByText(/Laboratorium jest chwilowo niedostępne/)).toBeInTheDocument();
    expect(screen.getByText(/Automatyczna próba nr 2 została zaplanowana/)).toBeInTheDocument();
    expect(screen.getByText("Status zlecenia bez zmian: Próbki pobrane")).toBeInTheDocument();
    expect(screen.queryByText(/LAB_SERVER_ERROR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SERVER_ERROR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SCHEDULED/)).not.toBeInTheDocument();
  });

  it("pokazuje nieudane ponowienie i wyczerpanie prób bez surowych kodów", async () => {
    mockHistoryResponse(
      historyResponse([
        historyItem({
          eventType: "TECHNICAL_ERROR",
          actorType: "SYSTEM",
          actorUserId: null,
          correlationId: "corr-server-error-1",
          previousStatus: "SAMPLE_COLLECTED",
          newStatus: "TECHNICAL_ERROR",
          details: {
            eventType: "TECHNICAL_ERROR",
            reason:
              "Automatyczne ponowienia wysyłki do laboratorium zostały wyczerpane.",
            attemptNumber: 4,
            previousStatus: "SAMPLE_COLLECTED",
            newStatus: "TECHNICAL_ERROR"
          }
        }),
        historyItem({
          eventType: "LAB_SEND_RETRY",
          actorType: "SYSTEM",
          actorUserId: null,
          correlationId: "corr-server-error-1",
          previousStatus: "SAMPLE_COLLECTED",
          newStatus: "TECHNICAL_ERROR",
          details: {
            eventType: "LAB_SEND_RETRY",
            attemptNumber: 4,
            outcome: "EXHAUSTED",
            labStatusCode: 503,
            previousStatus: "SAMPLE_COLLECTED",
            newStatus: "TECHNICAL_ERROR"
          }
        }),
        historyItem({
          eventType: "LAB_SEND_RETRY",
          actorType: "SYSTEM",
          actorUserId: null,
          correlationId: "corr-server-error-1",
          previousStatus: "SAMPLE_COLLECTED",
          newStatus: "SAMPLE_COLLECTED",
          details: {
            eventType: "LAB_SEND_RETRY",
            attemptNumber: 2,
            outcome: "FAILED_RETRY",
            labStatusCode: 503,
            nextAttemptNumber: 3,
            retryAfterSeconds: 30,
            nextRetryAt: "2026-09-07T10:00:45.000Z",
            previousStatus: "SAMPLE_COLLECTED",
            newStatus: "SAMPLE_COLLECTED"
          }
        })
      ])
    );

    render(<OrderHistorySection token="token" orderId="order-1" refreshKey={0} />);

    expect(
      await screen.findByText(/Automatyczna próba nr 2 nie powiodła się/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Kolejna próba nr 3 została zaplanowana/)).toBeInTheDocument();
    expect(screen.getByText(/Wyczerpano dostępne ponowienia/)).toBeInTheDocument();
    expect(
      screen.getAllByText("Zmiana statusu: Próbki pobrane → Błąd techniczny").length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Automatyczne ponowienia wysyłki do laboratorium zostały wyczerpane.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/FAILED_RETRY|EXHAUSTED|LAB_SERVER_ERROR|SERVER_ERROR/)).not.toBeInTheDocument();
  });

  it("pokazuje anulowane ponowienie wysyłki po polsku, bez kodu przyczyny", async () => {
    mockHistoryResponse(
      historyResponse([
        historyItem({
          eventType: "LAB_SEND_RETRY",
          actorType: "SYSTEM",
          actorUserId: null,
          correlationId: "corr-cancelled-1",
          previousStatus: "SAMPLE_COLLECTED",
          newStatus: "SAMPLE_COLLECTED",
          details: {
            eventType: "LAB_SEND_RETRY",
            attemptNumber: 2,
            outcome: "CANCELLED",
            reason: "PATIENT_INACTIVE",
            previousStatus: "SAMPLE_COLLECTED",
            newStatus: "SAMPLE_COLLECTED"
          }
        })
      ])
    );

    render(<OrderHistorySection token="token" orderId="order-1" refreshKey={0} />);

    expect(
      await screen.findByText(
        /Automatyczna próba nr 2 została anulowana: pacjent nie jest już aktywny\./
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/Zlecenie nie zostało wysłane/)).toBeInTheDocument();

    // Anulowanie nie zmienia statusu zlecenia.
    expect(
      screen.getByText("Status zlecenia bez zmian: Próbki pobrane")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Zmiana statusu:/)).not.toBeInTheDocument();

    // Bez surowych kodów technicznych i nazwy scenariusza.
    expect(screen.queryByText(/PATIENT_INACTIVE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/CANCELLED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/RATE_LIMIT/)).not.toBeInTheDocument();
  });

  it("pokazuje anulowanie ponowienia po zmianie danych zlecenia", async () => {
    mockHistoryResponse(
      historyResponse([
        historyItem({
          eventType: "LAB_SEND_RETRY",
          actorType: "SYSTEM",
          actorUserId: null,
          previousStatus: "SAMPLE_COLLECTED",
          newStatus: "SAMPLE_COLLECTED",
          details: {
            eventType: "LAB_SEND_RETRY",
            attemptNumber: 2,
            outcome: "CANCELLED",
            reason: "REQUEST_CHANGED",
            previousStatus: "SAMPLE_COLLECTED",
            newStatus: "SAMPLE_COLLECTED"
          }
        })
      ])
    );

    render(<OrderHistorySection token="token" orderId="order-1" refreshKey={0} />);

    expect(
      await screen.findByText(/dane zlecenia zmieniły się po pierwszej próbie/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/REQUEST_CHANGED/)).not.toBeInTheDocument();
  });

  it("pokazuje odrzucenie zlecenia bez błędów pól", async () => {
    mockHistoryResponse(
      historyResponse([
        historyItem({
          eventType: "LAB_ORDER_REJECTED",
          actorType: "LAB",
          actorUserId: null,
          previousStatus: "SAMPLE_COLLECTED",
          newStatus: "SAMPLE_COLLECTED",
          details: {
            eventType: "LAB_ORDER_REJECTED",
            rejectionType: "VALIDATION",
            errorCode: "LAB_ORDER_VALIDATION_ERROR",
            fieldErrors: [],
            previousStatus: "SAMPLE_COLLECTED",
            newStatus: "SAMPLE_COLLECTED"
          }
        })
      ])
    );

    render(<OrderHistorySection token="token" orderId="order-1" refreshKey={0} />);

    expect(
      await screen.findByText("Zlecenie nie przeszło walidacji po stronie laboratorium.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Zgłoszone uwagi:/)).not.toBeInTheDocument();
  });

  it("pokazuje pustą historię", async () => {
    mockHistoryResponse(historyResponse([]));

    render(<OrderHistorySection token="token" orderId="order-1" refreshKey={0} />);

    expect(
      await screen.findByText("Brak zarejestrowanych zdarzeń dla tego zlecenia.")
    ).toBeInTheDocument();
  });

  it("pokazuje błąd i pozwala ponowić żądanie", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse(historyResponse([historyItem({})])));

    render(<OrderHistorySection token="token" orderId="order-1" refreshKey={0} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nie udało się połączyć z serwerem."
    );

    await userEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    expect(await screen.findByText("Utworzono zlecenie")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("pokazuje wpis odtworzony podczas migracji bez wprowadzania w błąd", async () => {
    mockHistoryResponse(
      historyResponse([
        historyItem({
          eventType: "ORDER_CREATED",
          previousStatus: null,
          newStatus: "DRAFT",
          details: { eventType: "ORDER_CREATED", reconstructed: true }
        })
      ])
    );

    render(<OrderHistorySection token="token" orderId="order-1" refreshKey={0} />);

    expect(await screen.findByText("Utworzono zlecenie")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Wpis odtworzony podczas migracji danych — szczegóły mogły zostać uproszczone."
      )
    ).toBeInTheDocument();
  });

  it("pokazuje długi identyfikator eventId bez łamania układu", async () => {
    const longEventId = "evt-" + "a".repeat(80);
    mockHistoryResponse(
      historyResponse([
        historyItem({
          eventType: "LAB_RESULT_RECEIVED",
          actorType: "LAB",
          integrationEventId: longEventId,
          previousStatus: "SENT_TO_LAB",
          newStatus: "COMPLETED",
          details: {
            eventType: "LAB_RESULT_RECEIVED",
            eventId: longEventId,
            externalOrderId: "EXT-1",
            callbackStatus: "COMPLETED",
            resultCount: 1,
            testCodes: ["CRP"],
            previousStatus: "SENT_TO_LAB",
            newStatus: "COMPLETED"
          }
        })
      ])
    );

    render(<OrderHistorySection token="token" orderId="order-1" refreshKey={0} />);

    const idElement = await screen.findByText(longEventId);
    expect(idElement).toHaveClass("history-id");
  });

  it("obsługuje przycisk Pokaż starsze i dołącza kolejną stronę", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse(
          historyResponse(
            [historyItem({ eventType: "ORDER_UPDATED", details: updatedDetails() })],
            { total: 2 }
          )
        )
      )
      .mockResolvedValueOnce(
        jsonResponse(
          historyResponse([historyItem({ eventType: "ORDER_CREATED" })], {
            page: 2,
            total: 2
          })
        )
      );

    render(<OrderHistorySection token="token" orderId="order-1" refreshKey={0} />);

    expect(await screen.findByText("Edytowano zlecenie")).toBeInTheDocument();
    const loadMoreButton = screen.getByRole("button", { name: "Pokaż starsze" });

    await userEvent.click(loadMoreButton);

    expect(await screen.findByText("Utworzono zlecenie")).toBeInTheDocument();
    expect(screen.getByText("Edytowano zlecenie")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Pokaż starsze" })).not.toBeInTheDocument();
  });

  it("odświeża pierwszą stronę, gdy zmienia się refreshKey", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(historyResponse([historyItem({})])));

    const { rerender } = render(
      <OrderHistorySection token="token" orderId="order-1" refreshKey={0} />
    );
    await screen.findByText("Utworzono zlecenie");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    rerender(<OrderHistorySection token="token" orderId="order-1" refreshKey={1} />);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});

function mockHistoryResponse(response: OrderHistoryListResponse) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(response));
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function historyResponse(
  items: OrderHistoryItem[],
  meta: Partial<OrderHistoryListResponse["meta"]> = {}
): OrderHistoryListResponse {
  return {
    items,
    meta: {
      page: 1,
      pageSize: 20,
      total: items.length,
      totalPages: 1,
      ...meta
    }
  };
}

function updatedDetails() {
  return {
    eventType: "ORDER_UPDATED" as const,
    changedFields: ["priority" as const],
    patientChanged: false,
    previousPriority: "ROUTINE" as const,
    newPriority: "URGENT" as const,
    addedTestCodes: [],
    removedTestCodes: []
  };
}

function historyItem(overrides: Partial<OrderHistoryItem>): OrderHistoryItem {
  return {
    id: `history-${Math.random().toString(36).slice(2)}`,
    eventType: "ORDER_CREATED",
    occurredAt: "2026-09-07T10:00:00.000Z",
    actorType: "STAFF",
    actorUserId: "user-1",
    actorDisplayName: null,
    correlationId: null,
    integrationEventId: null,
    previousStatus: null,
    newStatus: "DRAFT",
    details: {
      eventType: "ORDER_CREATED",
      priority: "ROUTINE",
      testCodes: ["CRP"],
      requiredMaterials: ["SERUM"],
      finalStatus: "DRAFT"
    },
    ...overrides
  };
}
