import { cleanup, render, screen, within } from "@testing-library/react";
import type { DashboardSummaryResponse } from "@klinika/api-contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

const authenticatedUser = {
  id: "user-1",
  login: "staff.demo",
  displayName: "Personel pokazowy",
  role: "STAFF",
  workspace: {
    id: "workspace-1",
    name: "Klinika Pokazowa",
    slug: "klinika-pokazowa"
  }
};

const summary: DashboardSummaryResponse = {
  patients: { total: 4, active: 3, inactive: 1 },
  orders: {
    total: 7,
    byStatus: {
      DRAFT: 1,
      SAMPLE_COLLECTION_IN_PROGRESS: 1,
      SAMPLE_COLLECTED: 1,
      SENT_TO_LAB: 1,
      PROCESSING: 1,
      PARTIAL: 0,
      COMPLETED: 2,
      REJECTED: 0,
      TECHNICAL_ERROR: 0
    }
  }
};

describe("panel główny", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem("klinika-debug-token", "syntetyczny-token");
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
  });

  it("pokazuje stan ładowania podsumowania", async () => {
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/dashboard/summary") {
        return new Promise(() => {
          // celowo nierozstrzygnięte, żeby zobaczyć stan ładowania
        });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(await screen.findByText("Ładowanie podsumowania...")).toBeInTheDocument();
  });

  it("pokazuje liczby pacjentów i zleceń z polskimi etykietami statusów", async () => {
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/dashboard/summary") {
        return json(summary);
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    const patientsCard = (
      await screen.findByRole("heading", { name: "Pacjenci" })
    ).closest("section") as HTMLElement;
    const ordersCard = screen
      .getByRole("heading", { name: "Zlecenia" })
      .closest("section") as HTMLElement;

    expect(await within(patientsCard).findByText("4")).toBeInTheDocument();
    expect(within(patientsCard).getByText("Aktywni")).toBeInTheDocument();
    expect(within(patientsCard).getByText("3")).toBeInTheDocument();
    expect(within(patientsCard).getByText("Nieaktywni")).toBeInTheDocument();
    expect(within(patientsCard).getByText("1")).toBeInTheDocument();

    expect(within(ordersCard).getByText("7")).toBeInTheDocument();
    expect(within(ordersCard).getByText("Przygotowywane")).toBeInTheDocument();
    expect(
      within(ordersCard).getByText("Trwa pobieranie próbek")
    ).toBeInTheDocument();
    expect(within(ordersCard).getByText("Próbki pobrane")).toBeInTheDocument();
    expect(
      within(ordersCard).getByText("Wysłane do laboratorium")
    ).toBeInTheDocument();
    expect(
      within(ordersCard).getByText("W trakcie realizacji")
    ).toBeInTheDocument();
    expect(within(ordersCard).getByText("Wynik częściowy")).toBeInTheDocument();
    expect(within(ordersCard).getByText("Zakończone")).toBeInTheDocument();
    expect(within(ordersCard).getByText("Odrzucone")).toBeInTheDocument();
    expect(within(ordersCard).getByText("Błąd techniczny")).toBeInTheDocument();

    expect(
      within(patientsCard).getByRole("link", { name: "Pacjenci" })
    ).toHaveAttribute("href", "/patients");
    expect(
      within(patientsCard).getByRole("link", { name: "+ Dodaj pacjenta" })
    ).toHaveAttribute("href", "/patients/new");
    expect(
      within(ordersCard).getByRole("link", { name: "Zlecenia" })
    ).toHaveAttribute("href", "/orders");
    expect(
      within(ordersCard).getByRole("link", { name: "+ Nowe zlecenie" })
    ).toHaveAttribute("href", "/orders/new");
  });

  it("linkuje statusy zleceń i aktywność pacjentów do przefiltrowanych list", async () => {
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/dashboard/summary") {
        return json(summary);
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(await screen.findByText("4")).toBeInTheDocument();

    const patientsCard = screen
      .getByRole("heading", { name: "Pacjenci" })
      .closest("section") as HTMLElement;
    const ordersCard = screen
      .getByRole("heading", { name: "Zlecenia" })
      .closest("section") as HTMLElement;

    expect(
      within(patientsCard).getByText("Aktywni").closest("a")
    ).toHaveAttribute("href", "/patients?active=true");
    expect(
      within(patientsCard).getByText("Nieaktywni").closest("a")
    ).toHaveAttribute("href", "/patients?active=false");
    expect(
      within(ordersCard).getByText("Zakończone").closest("a")
    ).toHaveAttribute("href", "/orders?status=COMPLETED");
    expect(
      within(ordersCard).getByText("Błąd techniczny").closest("a")
    ).toHaveAttribute("href", "/orders?status=TECHNICAL_ERROR");
    expect(
      within(ordersCard).getByText("W trakcie realizacji").closest("a")
    ).toHaveAttribute("href", "/orders?status=PROCESSING");
  });

  it("pokazuje błąd, ale nadal wyświetla szybkie akcje, gdy podsumowanie się nie załaduje", async () => {
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/dashboard/summary") {
        return jsonError(500, "INTERNAL_ERROR", "Wystąpił błąd serwera.");
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(
      await screen.findByText(/Wystąpił błąd serwera\./)
    ).toBeInTheDocument();

    const patientsCard = screen
      .getByRole("heading", { name: "Pacjenci" })
      .closest("section") as HTMLElement;
    const ordersCard = screen
      .getByRole("heading", { name: "Zlecenia" })
      .closest("section") as HTMLElement;

    expect(
      within(patientsCard).getByRole("link", { name: "Pacjenci" })
    ).toHaveAttribute("href", "/patients");
    expect(
      within(patientsCard).getByRole("link", { name: "+ Dodaj pacjenta" })
    ).toHaveAttribute("href", "/patients/new");
    expect(
      within(ordersCard).getByRole("link", { name: "Zlecenia" })
    ).toHaveAttribute("href", "/orders");
    expect(
      within(ordersCard).getByRole("link", { name: "+ Nowe zlecenie" })
    ).toHaveAttribute("href", "/orders/new");
  });
});

function mockFetch(
  handler: (request: {
    url: string;
    init?: RequestInit;
  }) => Response | Promise<Response>
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

function jsonError(
  status: number,
  code: string,
  message: string,
  correlationId = "corr-test"
) {
  return json(
    {
      error: {
        code,
        message,
        correlationId,
        fieldErrors: []
      }
    },
    status
  );
}
