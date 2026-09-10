import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("domyślnie (bez parametru tab) pokazuje wyłącznie zakładkę Dokumentacja", async () => {
    mockFetch(defaultHandler);
    window.history.pushState({}, "", "/materials");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Materiały warsztatowe" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dokumentacja" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Logi aplikacji" })).not.toBeInTheDocument();

    const docsTab = screen.getByRole("link", { name: "Dokumentacja" });
    expect(docsTab).toHaveAttribute("aria-current", "page");
  });

  it("?tab=logs pokazuje wyłącznie sekcję Logi aplikacji z kartami logów", async () => {
    mockFetch(defaultHandler);
    window.history.pushState({}, "", "/materials?tab=logs");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Logi aplikacji" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dokumentacja" })).not.toBeInTheDocument();

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

  it("?tab=documentation pokazuje wyłącznie sekcję Dokumentacja", async () => {
    mockFetch(defaultHandler);
    window.history.pushState({}, "", "/materials?tab=documentation");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Dokumentacja" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Logi aplikacji" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: workshopLogs[0].title })).not.toBeInTheDocument();

    const docsTab = screen.getByRole("link", { name: "Dokumentacja" });
    expect(docsTab).toHaveAttribute("aria-current", "page");

    const heading = screen.getByRole("heading", { name: "Dokumentacja produktowa" });
    const card = heading.closest("article") as HTMLElement;
    expect(
      within(card).getByRole("link", { name: "Podgląd" })
    ).toHaveAttribute("href", "/materials/product-docs");
    const downloadLink = within(card).getByRole("link", { name: "Pobierz .md" });
    expect(downloadLink).toHaveAttribute("href", "/materials/docs/dokumentacja-produktowa.md");
    expect(downloadLink).toHaveAttribute("download");

    const apiHeading = screen.getByRole("heading", { name: "Dokumentacja API" });
    const apiCard = apiHeading.closest("article") as HTMLElement;
    const openApiLink = within(apiCard).getByRole("link", { name: "Otwórz OpenAPI" });
    expect(openApiLink).toHaveAttribute("href", "/api/docs");
    expect(openApiLink).toHaveAttribute("target", "_blank");

    const openApiJsonLink = within(apiCard).getByRole("link", { name: "Pobierz OpenAPI JSON" });
    expect(openApiJsonLink).toHaveAttribute("href", "/api/docs-json");
    expect(openApiJsonLink).toHaveAttribute("download");
  });

  it("kopiuje surowy Markdown dokumentacji produktowej do schowka, nie wyrenderowany tekst", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const rawMarkdown = "# Dokumentacja produktowa\n\n- **Punkt** z `kodem`\n";
    mockFetch((request) => {
      if (request.url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (request.url === "/materials/docs/dokumentacja-produktowa.md") {
        return new Response(rawMarkdown, { status: 200 });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    window.history.pushState({}, "", "/materials?tab=documentation");
    render(<App />);

    const heading = await screen.findByRole("heading", { name: "Dokumentacja produktowa" });
    const card = heading.closest("article") as HTMLElement;
    await userEvent.click(within(card).getByRole("button", { name: "Kopiuj dokumentację" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(rawMarkdown));
    expect(await within(card).findByRole("button", { name: "Skopiowano" })).toBeInTheDocument();
  });

  it("nieprawidłowa wartość parametru tab bezpiecznie pokazuje domyślną zakładkę Dokumentacja", async () => {
    mockFetch(defaultHandler);
    window.history.pushState({}, "", "/materials?tab=xyz");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Dokumentacja" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Logi aplikacji" })).not.toBeInTheDocument();
  });

  it("pozwala przełączać zakładki klikając w linki stylizowane jak taby", async () => {
    mockFetch(defaultHandler);
    window.history.pushState({}, "", "/materials");
    render(<App />);

    await screen.findByRole("heading", { name: "Dokumentacja" });

    await userEvent.click(screen.getByRole("link", { name: "Logi aplikacji" }));

    expect(await screen.findByRole("heading", { name: "Logi aplikacji" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dokumentacja" })).not.toBeInTheDocument();
    expect(window.location.search).toBe("?tab=logs");

    await userEvent.click(screen.getByRole("link", { name: "Dokumentacja" }));

    expect(await screen.findByRole("heading", { name: "Dokumentacja" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Logi aplikacji" })).not.toBeInTheDocument();
    expect(window.location.search).toBe("?tab=documentation");
  });

  it("pokazuje stan ładowania, a następnie treść pobranego logu w podglądzie", async () => {
    const material = workshopLogs[0];
    let resolveLogFetch: (response: Response) => void = () => undefined;
    const logFetchPromise = new Promise<Response>((resolve) => {
      resolveLogFetch = resolve;
    });
    mockFetch((request) => {
      if (request.url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (request.url === `/materials/logs/${material.filename}`) {
        return logFetchPromise;
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    window.history.pushState({}, "", `/materials/logs/${material.id}`);
    render(<App />);

    expect(await screen.findByText("Ładowanie logu...")).toBeInTheDocument();

    resolveLogFetch(new Response(sampleLogContent, { status: 200 }));

    await waitFor(() => {
      expect(screen.queryByText("Ładowanie logu...")).not.toBeInTheDocument();
    });

    expect(screen.getByText(material.filename)).toBeInTheDocument();
    expect(screen.getByText("3 z 3 wpisów")).toBeInTheDocument();
    expect(screen.getByText(/"event":"a"/)).toBeInTheDocument();

    const downloadLink = screen.getByRole("link", { name: "Pobierz .log" });
    expect(downloadLink).toHaveAttribute("href", `/materials/logs/${material.filename}`);
    expect(downloadLink).toHaveAttribute("download");
  });

  it("breadcrumb 'Materiały' z podglądu logu prowadzi do /materials?tab=logs", async () => {
    const material = workshopLogs[0];
    mockFetch((request) => {
      if (request.url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (request.url === `/materials/logs/${material.filename}`) {
        return new Response(sampleLogContent, { status: 200 });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    window.history.pushState({}, "", `/materials/logs/${material.id}`);
    render(<App />);

    await screen.findByText(material.filename);
    const breadcrumb = document.querySelector(".breadcrumbs") as HTMLElement;
    const breadcrumbLink = within(breadcrumb).getByRole("link", { name: "Materiały" });
    expect(breadcrumbLink).toHaveAttribute("href", "/materials?tab=logs");
  });

  it("renderuje dokumentację produktową jako sformatowaną stronę (heading/akapit/lista/tabela), pozwala pobrać .md, a breadcrumb wraca do /materials?tab=documentation", async () => {
    const docsContent = [
      "## Sekcja testowa",
      "",
      "Akapit testowy z **pogrubieniem** i `inline code`.",
      "",
      "- Punkt A",
      "- Punkt B",
      "",
      "| Kolumna | Wartość |",
      "| --- | --- |",
      "| a | 1 |",
      ""
    ].join("\n");
    mockFetch((request) => {
      if (request.url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (request.url === "/materials/docs/dokumentacja-produktowa.md") {
        return new Response(docsContent, { status: 200 });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    window.history.pushState({}, "", "/materials/product-docs");
    render(<App />);

    // Nagłówek strony (PageHeader) pochodzi z kodu, nagłówek "Sekcja testowa"
    // z wyrenderowanego Markdownu dokumentacji — oba muszą się pojawić.
    expect(
      await screen.findByRole("heading", { name: "Dokumentacja produktowa", level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sekcja testowa", level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/Akapit testowy z/)).toBeInTheDocument();
    expect(screen.getByText("pogrubieniem").tagName).toBe("STRONG");
    expect(screen.getByText("inline code").tagName).toBe("CODE");
    expect(screen.getByText("Punkt A").closest("li")).toBeInTheDocument();
    expect(screen.getByText("Punkt B").closest("li")).toBeInTheDocument();

    const table = screen.getByRole("table");
    expect(within(table).getByText("Kolumna")).toBeInTheDocument();
    expect(within(table).getByText("Wartość")).toBeInTheDocument();

    const breadcrumb = document.querySelector(".breadcrumbs") as HTMLElement;
    const breadcrumbLink = within(breadcrumb).getByRole("link", { name: "Materiały" });
    expect(breadcrumbLink).toHaveAttribute("href", "/materials?tab=documentation");

    const downloadLink = screen.getByRole("link", { name: "Pobierz .md" });
    expect(downloadLink).toHaveAttribute("href", "/materials/docs/dokumentacja-produktowa.md");
  });

  it("dokumentacja z wiodącym H1 ma tylko JEDEN H1 (użyty jako PageHeader, nie zdublowany w treści)", async () => {
    const docsContent = "# Tytuł Testowy\n\nAkapit po H1.\n";
    mockFetch((request) => {
      if (request.url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (request.url === "/materials/docs/dokumentacja-produktowa.md") {
        return new Response(docsContent, { status: 200 });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    window.history.pushState({}, "", "/materials/product-docs");
    render(<App />);

    // getByRole rzuci błąd, gdyby na stronie było więcej niż jedno
    // dopasowanie — to jest dowód na brak zdublowanego H1.
    expect(
      await screen.findByRole("heading", { name: "Tytuł Testowy", level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByText("Akapit po H1.")).toBeInTheDocument();
  });

  it("dokumentacja bez wiodącego H1 pokazuje fallbackowy tytuł 'Dokumentacja produktowa'", async () => {
    const docsContent = "Treść bez nagłówka.\n";
    mockFetch((request) => {
      if (request.url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (request.url === "/materials/docs/dokumentacja-produktowa.md") {
        return new Response(docsContent, { status: 200 });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    window.history.pushState({}, "", "/materials/product-docs");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Dokumentacja produktowa", level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByText("Treść bez nagłówka.")).toBeInTheDocument();
  });

  it("pokazuje komunikat błędu po polsku, a link 'Wróć do materiałów' wraca do /materials?tab=documentation, gdy pobranie dokumentacji się nie powiedzie", async () => {
    mockFetch((request) => {
      if (request.url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (request.url === "/materials/docs/dokumentacja-produktowa.md") {
        return new Response("not found", { status: 404 });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    window.history.pushState({}, "", "/materials/product-docs");
    render(<App />);

    expect(
      await screen.findByText("Nie udało się załadować dokumentacji.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Wróć do materiałów" })).toHaveAttribute(
      "href",
      "/materials?tab=documentation"
    );
  });

  it("placeholder pola wyszukiwania nie sugeruje wpisania correlationId", async () => {
    const material = workshopLogs[0];
    mockFetch((request) => {
      if (request.url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (request.url === `/materials/logs/${material.filename}`) {
        return new Response(sampleLogContent, { status: 200 });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    window.history.pushState({}, "", `/materials/logs/${material.id}`);
    render(<App />);

    const input = await screen.findByLabelText("Szukaj w logu");
    const placeholder = input.getAttribute("placeholder") ?? "";
    expect(placeholder.toLowerCase()).not.toContain("correlationid");
    expect(placeholder).toBe("Wpisz szukany tekst");
  });

  it("filtruje log po tekście, pokazuje licznik i pozwala kopiować całość oraz wynik", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const material = workshopLogs[0];
    mockFetch((request) => {
      if (request.url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (request.url === `/materials/logs/${material.filename}`) {
        return new Response(sampleLogContent, { status: 200 });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    window.history.pushState({}, "", `/materials/logs/${material.id}`);
    render(<App />);

    expect(await screen.findByText("3 z 3 wpisów")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kopiuj wynik" })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Szukaj w logu"), "event\":\"b");

    expect(await screen.findByText("1 z 3 wpisów")).toBeInTheDocument();
    expect(screen.queryByText(/"event":"a"/)).not.toBeInTheDocument();
    expect(screen.getByText(/"event":"b"/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Kopiuj wynik" }));
    expect(writeText).toHaveBeenCalledWith('{"event":"b"}');

    await userEvent.click(screen.getByRole("button", { name: "Kopiuj cały log" }));
    expect(writeText).toHaveBeenCalledWith(sampleLogContent);

    await userEvent.click(screen.getByRole("button", { name: "Wyczyść" }));
    expect(await screen.findByText("3 z 3 wpisów")).toBeInTheDocument();
  });

  it("pokazuje komunikat o braku wyników wyszukiwania w logu", async () => {
    const material = workshopLogs[0];
    mockFetch((request) => {
      if (request.url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (request.url === `/materials/logs/${material.filename}`) {
        return new Response(sampleLogContent, { status: 200 });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    window.history.pushState({}, "", `/materials/logs/${material.id}`);
    render(<App />);

    await userEvent.type(
      await screen.findByLabelText("Szukaj w logu"),
      "nieistniejący fragment"
    );

    expect(
      await screen.findByText("Brak wpisów pasujących do wyszukiwania.")
    ).toBeInTheDocument();
    expect(screen.getByText("0 z 3 wpisów")).toBeInTheDocument();
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
      "/materials?tab=logs"
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
      "/materials?tab=logs"
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
