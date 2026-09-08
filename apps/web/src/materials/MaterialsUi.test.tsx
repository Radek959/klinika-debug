import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { workshopLogs } from "./workshopLogs";

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

const sampleLogContent = ['{"event":"a"}', '{"event":"b"}', '{"event":"c"}'].join("\n") + "\n";

describe("materiały warsztatowe", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem("klinika-debug-token", "syntetyczny-token");
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
  });

  it("pokazuje link 'Materiały' w nawigacji i prowadzi do /materials", async () => {
    mockFetch(defaultHandler);
    render(<App />);

    const link = await screen.findByRole("link", { name: "Materiały" });
    expect(link).toHaveAttribute("href", "/materials");
  });

  it("wyświetla wszystkie zatwierdzone materiały z neutralnymi polskimi nazwami, podglądem i pobraniem", async () => {
    mockFetch(defaultHandler);
    window.history.pushState({}, "", "/materials");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Materiały warsztatowe" })).toBeInTheDocument();

    for (const material of workshopLogs) {
      const heading = screen.getByRole("heading", { name: material.title });
      const card = heading.closest("article") as HTMLElement;
      expect(card).toBeInTheDocument();

      const previewLink = within(card).getByRole("link", { name: "Podgląd" });
      expect(previewLink).toHaveAttribute("href", `/materials/logs/${material.id}`);

      const downloadLink = within(card).getByRole("link", { name: "Pobierz .log" });
      expect(downloadLink).toHaveAttribute("href", `/materials/logs/${material.filename}`);
      expect(downloadLink).toHaveAttribute("download");
    }

    expect(screen.queryByText("api-diagnostics.log")).not.toBeInTheDocument();
  });

  it("pokazuje stan ładowania, a następnie treść pobranego logu w podglądzie", async () => {
    const material = workshopLogs[0];
    mockFetch((request) => {
      if (request.url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (request.url === `/materials/logs/${material.filename}`) {
        return new Promise((resolve) => {
          setTimeout(() => resolve(new Response(sampleLogContent, { status: 200 })), 0);
        });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    window.history.pushState({}, "", `/materials/logs/${material.id}`);
    render(<App />);

    expect(await screen.findByText("Ładowanie logu...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("Ładowanie logu...")).not.toBeInTheDocument();
    });

    expect(screen.getByText(material.filename)).toBeInTheDocument();
    expect(screen.getByText("3 wpisów")).toBeInTheDocument();
    expect(screen.getByText(/"event":"a"/)).toBeInTheDocument();

    const downloadLink = screen.getByRole("link", { name: "Pobierz .log" });
    expect(downloadLink).toHaveAttribute("href", `/materials/logs/${material.filename}`);
    expect(downloadLink).toHaveAttribute("download");
  });

  it("pokazuje bezpieczny ekran, gdy logId nie jest na whiteliście, bez próby pobrania pliku", async () => {
    const fetchSpy = mockFetch((request) => {
      if (request.url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    // logId nie znajduje się na whiteliście `workshopLogs` — w szczególności
    // podanie surowej, technicznej nazwy pliku zamiast zatwierdzonego `id`
    // nie może niczego pobrać ani odsłonić.
    window.history.pushState({}, "", "/materials/logs/api-diagnostics.log");
    render(<App />);

    expect(await screen.findByText("Materiał nie istnieje")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Wróć do materiałów" })).toHaveAttribute(
      "href",
      "/materials"
    );

    const attemptedFetchOfRawParam = fetchSpy.mock.calls.some(([input]) =>
      String(input).includes("/materials/logs/api-diagnostics.log")
    );
    expect(attemptedFetchOfRawParam).toBe(false);
  });

  it("pokazuje komunikat błędu po polsku, gdy pobranie fixture'u się nie powiedzie", async () => {
    const material = workshopLogs[0];
    mockFetch((request) => {
      if (request.url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (request.url === `/materials/logs/${material.filename}`) {
        return new Response("not found", { status: 404 });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    window.history.pushState({}, "", `/materials/logs/${material.id}`);
    render(<App />);

    expect(await screen.findByText("Nie udało się załadować materiału.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Wróć do materiałów" })).toHaveAttribute(
      "href",
      "/materials"
    );
    expect(screen.queryByText(/stack/i)).not.toBeInTheDocument();
  });
});

function defaultHandler(request: { url: string }) {
  if (request.url === "/api/v1/auth/me") {
    return json({ user: authenticatedUser });
  }
  return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
}

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
