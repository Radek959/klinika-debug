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
