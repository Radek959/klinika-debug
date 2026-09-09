import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OrderDetailsResponse, OrderListItem } from "@klinika/api-contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

/**
 * Regresje dla centralnej obsługi `SESSION_EXPIRED` (`api/client.ts` +
 * `App.tsx`): niezależnie OD KTÓREGO ekranu i OD KTÓREGO powodu (reset
 * jednego uczestnika, reset całego środowiska, naturalne wygaśnięcie sesji)
 * backend zwróci `HTTP 401` z `error.code === "SESSION_EXPIRED"`, frontend
 * uczestnika musi: usunąć token, przestać traktować użytkownika jako
 * zalogowanego i przejść do `/login` — bez F5, bez ręcznego „Wyloguj” i bez
 * konieczności wejścia na konkretną stronę.
 *
 * Testy NIE wywołują faktycznego `/admin` — symulują wyłącznie rezultat
 * backendowego revoke sesji przez odpowiedź `401 SESSION_EXPIRED` na kolejny
 * authenticated request, tak jak opisano w audycie gotowości warsztatu.
 */

const authenticatedUser = {
  id: "user-1",
  login: "tester01",
  displayName: "Uczestnik Warsztatu",
  role: "STAFF",
  workspace: {
    id: "workspace-1",
    name: "Klinika Warsztatowa 01",
    slug: "warsztat-01"
  }
};

const orderListItem: OrderListItem = {
  id: "order-1",
  patient: {
    id: "patient-1",
    firstName: "Anna",
    lastName: "Nowak",
    identifierType: "PESEL",
    pesel: "44051401458",
    documentType: null,
    documentNumber: null,
    documentCountry: null,
    birthDate: "1990-01-01",
    active: true
  },
  priority: "ROUTINE",
  status: "SENT_TO_LAB",
  tests: [{ medicalTestId: "test-crp", code: "CRP", name: "CRP", materialType: "SERUM" }],
  samples: [{ materialType: "SERUM", status: "COLLECTED" }],
  externalOrderId: "EXT-123",
  correlationId: null,
  sentAt: "2026-09-06T10:05:00.000Z",
  estimatedCompletionAt: "2026-09-06T10:10:00.000Z",
  createdByUserId: "user-1",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z"
};

describe("centralna obsługa SESSION_EXPIRED", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem("klinika-debug-token", "syntetyczny-token");
  });

  afterEach(() => {
    cleanup();
  });

  it(
    "reset pojedynczego uczestnika: kolejny authenticated request zwracający " +
      "401 SESSION_EXPIRED czyści token i przenosi do /login",
    async () => {
      window.history.pushState({}, "", "/orders/order-1");
      let orderRequests = 0;

      mockFetch(({ url }) => {
        if (url === "/api/v1/auth/me") {
          return json({ user: authenticatedUser });
        }
        if (url.startsWith("/api/v1/orders/order-1/history")) {
          return json({ items: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
        }
        if (url === "/api/v1/orders/order-1") {
          orderRequests += 1;
          if (orderRequests === 1) {
            return json(orderDetails());
          }
          // Prowadzący zresetował warsztat-01 w tle (`/admin` → reset
          // uczestnika) — backend unieważnił sesję tester01.
          return sessionExpiredError();
        }
        return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
      });

      render(<App />);

      const refreshButton = await screen.findByRole("button", { name: "Odśwież status" });
      await userEvent.click(refreshButton);

      expect(await screen.findByRole("heading", { name: "Logowanie" })).toBeInTheDocument();
      expect(sessionStorage.getItem("klinika-debug-token")).toBeNull();
    }
  );

  it(
    "reset całego środowiska: dowolna kolejna authenticated akcja (np. wejście " +
      "w szczegóły zlecenia z listy) kończy się przejściem do /login",
    async () => {
      window.history.pushState({}, "", "/orders");
      let orderDetailsRequests = 0;

      mockFetch(({ url }) => {
        if (url === "/api/v1/auth/me") {
          return json({ user: authenticatedUser });
        }
        if (url.startsWith("/api/v1/orders?")) {
          return json({ items: [orderListItem], page: 1, pageSize: 20, total: 1, totalPages: 1 });
        }
        if (url === "/api/v1/orders/order-1") {
          orderDetailsRequests += 1;
          // Globalny reset środowiska revoke'ował sesje wszystkich
          // uczestników — kolejny authenticated request (tu: wejście w
          // szczegóły zlecenia) zwraca 401 SESSION_EXPIRED.
          return sessionExpiredError();
        }
        return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
      });

      render(<App />);

      await userEvent.click(await screen.findByRole("link", { name: "Szczegóły" }));

      expect(await screen.findByRole("heading", { name: "Logowanie" })).toBeInTheDocument();
      expect(sessionStorage.getItem("klinika-debug-token")).toBeNull();
      await waitFor(() => expect(orderDetailsRequests).toBeGreaterThan(0));
    }
  );

  it("zwykły błąd 500 INTERNAL_SERVER_ERROR nie wylogowuje użytkownika", async () => {
    window.history.pushState({}, "", "/orders/order-1");

    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/orders/order-1") {
        return jsonError(500, "INTERNAL_SERVER_ERROR", "Wystąpił nieoczekiwany błąd serwera.");
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Nie udało się wczytać zlecenia" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Logowanie" })).not.toBeInTheDocument();
    expect(sessionStorage.getItem("klinika-debug-token")).toBe("syntetyczny-token");
  });
});

function mockFetch(
  handler: (request: { url: string; init?: RequestInit }) => Response | Promise<Response>
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    return Promise.resolve(handler({ url: String(input), init }));
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function jsonError(status: number, code: string, message: string, correlationId = "corr-test") {
  return json({ error: { code, message, correlationId, fieldErrors: [] } }, status);
}

function sessionExpiredError() {
  return jsonError(401, "SESSION_EXPIRED", "Sesja wygasła albo token jest nieprawidłowy.");
}

function orderDetails(overrides: Partial<OrderDetailsResponse> = {}): OrderDetailsResponse {
  return {
    id: "order-1",
    patientId: "patient-1",
    patient: {
      id: "patient-1",
      firstName: "Anna",
      lastName: "Nowak",
      identifierType: "PESEL",
      pesel: "44051401458",
      documentType: null,
      documentNumber: null,
      documentCountry: null,
      birthDate: "1990-01-01",
      gender: "FEMALE",
      active: true,
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z"
    },
    priority: "ROUTINE",
    status: "SENT_TO_LAB",
    tests: [
      {
        id: "order-test-1",
        medicalTestId: "test-crp",
        code: "CRP",
        name: "CRP",
        materialType: "SERUM",
        status: "PENDING",
        additionalData: null
      }
    ],
    samples: [
      {
        id: "sample-1",
        materialType: "SERUM",
        status: "COLLECTED",
        barcode: "SMP-0001",
        collectedAt: "2026-09-06T10:00:00.000Z",
        collectedByUserId: "user-1",
        rejectionCode: null,
        rejectionReason: null
      }
    ],
    results: [],
    externalOrderId: "EXT-123",
    correlationId: null,
    sentAt: "2026-09-06T10:05:00.000Z",
    estimatedCompletionAt: "2026-09-06T10:10:00.000Z",
    createdByUserId: "user-1",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides
  };
}
