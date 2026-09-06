import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PatientResponse } from "@klinika/api-contracts";
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

const patient: PatientResponse = {
  id: "patient-1",
  firstName: "Anna",
  lastName: "Nowak",
  identifierType: "PESEL",
  pesel: "44051401458",
  documentType: null,
  documentNumber: null,
  documentCountry: null,
  birthDate: "1944-05-14",
  gender: "MALE",
  citizenship: "PL",
  phone: "500600700",
  email: "anna.nowak@example.test",
  addressStreet: "Testowa",
  addressBuildingNumber: "10",
  addressApartmentNumber: null,
  addressPostalCode: "00-001",
  addressCity: "Warszawa",
  addressCountry: "PL",
  active: true,
  guardian: null,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z"
};

describe("interfejs pacjentów", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem("klinika-debug-token", "syntetyczny-token");
    window.history.pushState({}, "", "/patients");
  });

  afterEach(() => {
    cleanup();
  });

  it("odtwarza sesję i pobiera listę pacjentów z parametrami po stronie API", async () => {
    const fetchMock = mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url.startsWith("/api/v1/patients?")) {
        return json({
          items: [patient],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1
        });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(await screen.findByText("Anna Nowak")).toBeInTheDocument();
    expect(screen.getByText("Klinika Pokazowa")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pacjenci" })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Wyszukaj"), "Nowak");
    await userEvent.selectOptions(screen.getByLabelText("Aktywność"), "true");
    await userEvent.selectOptions(screen.getByLabelText("Sortowanie"), "birthDate");

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => {
          const url = String(input);
          return (
            url.startsWith("/api/v1/patients?") &&
            url.includes("search=Nowak") &&
            url.includes("active=true") &&
            url.includes("sort=birthDate") &&
            url.includes("page=1")
          );
        })
      ).toBe(true);
    });
  });

  it("pokazuje pusty wynik, obsługuje paginację i czyści filtry", async () => {
    const requestedUrls: string[] = [];
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url.startsWith("/api/v1/patients?")) {
        requestedUrls.push(url);
        if (url.includes("active=false") || url.includes("page=2")) {
          return json({
            items: [patient],
            page: url.includes("page=2") ? 2 : 1,
            pageSize: 20,
            total: 25,
            totalPages: 2
          });
        }
        return json({
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0
        });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Brak pacjentów" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Aktywność"), "false");
    expect(await screen.findByText("Anna Nowak")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Następna" }));
    await userEvent.click(screen.getByRole("button", { name: "Poprzednia" }));
    await userEvent.click(screen.getByRole("button", { name: "Wyczyść filtry" }));

    await waitFor(() => {
      expect(requestedUrls.some((url) => url.includes("active=false"))).toBe(true);
      expect(requestedUrls.some((url) => url.includes("page=2"))).toBe(true);
      expect(requestedUrls[requestedUrls.length - 1]).toContain("sort=lastName");
    });
  });

  it("pokazuje błąd listy z correlationId i nie zostawia starych wyników", async () => {
    let listRequest = 0;
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url.startsWith("/api/v1/patients?")) {
        listRequest += 1;
        if (listRequest === 1) {
          return json({
            items: [patient],
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1
          });
        }
        return jsonError(
          500,
          "INTERNAL_ERROR",
          "Nie udało się pobrać listy pacjentów.",
          "corr-list"
        );
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(await screen.findByText("Anna Nowak")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Wyszukaj"), "Błąd");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Identyfikator błędu: corr-list"
    );
    expect(screen.queryByText("Anna Nowak")).not.toBeInTheDocument();
  });

  it("ignoruje starszą odpowiedź listy, która wróciła po nowszej", async () => {
    const firstList = deferred<Response>();
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return Promise.resolve(json({ user: authenticatedUser }));
      }
      if (url.startsWith("/api/v1/patients?") && !url.includes("search=Beta")) {
        return firstList.promise;
      }
      if (url.startsWith("/api/v1/patients?") && url.includes("search=Beta")) {
        return Promise.resolve(
          json({
            items: [{ ...patient, id: "patient-2", firstName: "Beta" }],
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1
          })
        );
      }
      return Promise.resolve(jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu."));
    });

    render(<App />);

    await userEvent.type(await screen.findByLabelText("Wyszukaj"), "Beta");
    expect(await screen.findByText("Beta Nowak")).toBeInTheDocument();

    firstList.resolve(
      json({
        items: [patient],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1
      })
    );

    await waitFor(() => {
      expect(screen.getByText("Beta Nowak")).toBeInTheDocument();
      expect(screen.queryByText("Anna Nowak")).not.toBeInTheDocument();
    });
  });

  it("pokazuje szczegóły pacjenta i dezaktywuje go po potwierdzeniu", async () => {
    window.history.pushState({}, "", "/patients/patient-1");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let patchBody: unknown;

    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/patients/patient-1" && init?.method === "PATCH") {
        patchBody = JSON.parse(String(init.body));
        return json({ ...patient, active: false });
      }
      if (url === "/api/v1/patients/patient-1") {
        return json(patient);
      }
      return jsonError(404, "PATIENT_NOT_FOUND", "Nie znaleziono pacjenta.");
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Anna Nowak" })).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Oznacz jako nieaktywnego" })
    );

    await waitFor(() => expect(patchBody).toEqual({ active: false }));
    expect(await screen.findByText("Nieaktywny")).toBeInTheDocument();
    expect(
      screen.getByText("Pacjent został oznaczony jako nieaktywny.")
    ).toBeInTheDocument();
  });

  it("rozróżnia 404, błąd techniczny i błąd połączenia w szczegółach", async () => {
    await expectDetailsLoadError({
      response: jsonError(404, "PATIENT_NOT_FOUND", "Nie znaleziono pacjenta."),
      heading: "Nie znaleziono pacjenta",
      message: "Nie znaleziono pacjenta."
    });
    await expectDetailsLoadError({
      response: jsonError(500, "INTERNAL_ERROR", "Wystąpił błąd serwera.", "corr-500"),
      heading: "Nie udało się pobrać danych pacjenta",
      message: "Wystąpił błąd serwera. Identyfikator błędu: corr-500"
    });
    await expectDetailsLoadError({
      response: new TypeError("Failed to fetch"),
      heading: "Nie udało się pobrać danych pacjenta",
      message:
        "Nie udało się połączyć z serwerem. Sprawdź połączenie i spróbuj ponownie."
    });
  });

  it("ignoruje starszą odpowiedź szczegółów po przejściu na innego pacjenta", async () => {
    window.history.pushState({}, "", "/patients/patient-a");
    const firstPatient = deferred<Response>();

    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return Promise.resolve(json({ user: authenticatedUser }));
      }
      if (url === "/api/v1/patients/patient-a") {
        return firstPatient.promise;
      }
      if (url === "/api/v1/patients/patient-b") {
        return Promise.resolve(
          json({ ...patient, id: "patient-b", firstName: "Barbara" })
        );
      }
      return Promise.resolve(jsonError(404, "PATIENT_NOT_FOUND", "Nie znaleziono pacjenta."));
    });

    render(<App />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/v1/patients/patient-a",
      expect.any(Object)
    ));
    window.history.pushState({}, "", "/patients/patient-b");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(await screen.findByRole("heading", { name: "Barbara Nowak" })).toBeInTheDocument();
    firstPatient.resolve(json({ ...patient, id: "patient-a" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Barbara Nowak" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Anna Nowak" })).not.toBeInTheDocument();
    });
  });

  it("tworzy pacjenta z innym dokumentem bez wysyłania workspaceId ani starego PESEL-u", async () => {
    window.history.pushState({}, "", "/patients/new");
    let postBody: Record<string, unknown> | null = null;

    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/patients" && init?.method === "POST") {
        postBody = JSON.parse(String(init.body));
        return json({
          ...patient,
          id: "patient-created",
          identifierType: "OTHER_DOCUMENT",
          pesel: null,
          documentType: "PASSPORT",
          documentNumber: "AB123456",
          documentCountry: "PL"
        });
      }
      if (url === "/api/v1/patients/patient-created") {
        return json({ ...patient, id: "patient-created" });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    await screen.findByRole("heading", { name: "Dodaj pacjenta" });
    await userEvent.type(screen.getByLabelText("Imię"), "Jan");
    await userEvent.type(screen.getByLabelText("Nazwisko"), "Testowy");
    await userEvent.type(screen.getByLabelText("PESEL"), "44051401458");
    await userEvent.selectOptions(
      screen.getByLabelText("Typ identyfikatora"),
      "OTHER_DOCUMENT"
    );
    await userEvent.type(screen.getByLabelText("Rodzaj dokumentu"), "PASSPORT");
    await userEvent.type(screen.getByLabelText("Numer dokumentu"), "AB123456");
    await userEvent.type(screen.getByLabelText("Kraj wydania"), "PL");
    await userEvent.type(screen.getByLabelText("Data urodzenia"), "1990-01-02");
    await userEvent.type(screen.getByLabelText("Telefon"), "500600700");
    await userEvent.click(screen.getByRole("button", { name: "Utwórz pacjenta" }));

    await waitFor(() => expect(postBody).not.toBeNull());
    expect(postBody).toMatchObject({
      firstName: "Jan",
      lastName: "Testowy",
      identifierType: "OTHER_DOCUMENT",
      documentType: "PASSPORT",
      documentNumber: "AB123456",
      documentCountry: "PL"
    });
    expect(postBody).not.toHaveProperty("workspaceId");
    expect(postBody).not.toHaveProperty("pesel");
  });

  it("tworzy pacjenta z PESEL-em oraz niepełnoletniego pacjenta z opiekunem", async () => {
    await expectCreatePayload("44051401458", {
      pesel: "44051401458"
    });
    await expectCreatePayload("16210112345", {
      pesel: "16210112345",
      guardian: {
        firstName: "Marta",
        lastName: "Opiekun",
        phone: "500600700",
        email: null
      }
    });
  });

  it("mapuje konflikty PESEL i dokumentu na polskie komunikaty", async () => {
    await expectCreateError(
      "DUPLICATE_PESEL",
      "W tej placówce istnieje już pacjent z tym numerem PESEL."
    );
    await expectCreateError(
      "DUPLICATE_DOCUMENT",
      "W tej placówce istnieje już pacjent z tym dokumentem."
    );
  });

  it("blokuje ponowne wysłanie formularza podczas trwającego requestu", async () => {
    window.history.pushState({}, "", "/patients/new");
    const save = deferred<Response>();
    let postCount = 0;
    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return Promise.resolve(json({ user: authenticatedUser }));
      }
      if (url === "/api/v1/patients" && init?.method === "POST") {
        postCount += 1;
        return save.promise;
      }
      return Promise.resolve(jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu."));
    });

    render(<App />);

    await fillAdultPeselForm();
    const button = screen.getByRole("button", { name: "Utwórz pacjenta" });
    await userEvent.click(button);
    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(postCount).toBe(1);
    save.resolve(json(patient));
  });

  it("edytuje pacjenta wysyłając tylko zmienione pola", async () => {
    window.history.pushState({}, "", "/patients/patient-1/edit");
    let patchBody: Record<string, unknown> | null = null;

    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/patients/patient-1" && init?.method === "PATCH") {
        patchBody = JSON.parse(String(init.body));
        return json({ ...patient, lastName: "Kowalska" });
      }
      if (url === "/api/v1/patients/patient-1") {
        return json(patient);
      }
      return jsonError(404, "PATIENT_NOT_FOUND", "Nie znaleziono pacjenta.");
    });

    render(<App />);

    const saveButton = await screen.findByRole("button", { name: "Zapisz zmiany" });
    expect(saveButton).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Nazwisko"));
    await userEvent.type(screen.getByLabelText("Nazwisko"), "Kowalska");
    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(patchBody).toEqual({ lastName: "Kowalska" }));
  });

  it("edytuje tylko jeden atrybut opiekuna przez częściowy PATCH", async () => {
    window.history.pushState({}, "", "/patients/patient-1/edit");
    let patchBody: Record<string, unknown> | null = null;
    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/patients/patient-1" && init?.method === "PATCH") {
        patchBody = JSON.parse(String(init.body));
        return json({ ...patient, guardian: guardian(), email: "nowy@example.test" });
      }
      if (url === "/api/v1/patients/patient-1") {
        return json({ ...patient, guardian: guardian() });
      }
      return jsonError(404, "PATIENT_NOT_FOUND", "Nie znaleziono pacjenta.");
    });

    render(<App />);

    await screen.findByRole("heading", { name: "Edytuj pacjenta" });
    await userEvent.clear(screen.getByLabelText("E-mail opiekuna"));
    await userEvent.type(screen.getByLabelText("E-mail opiekuna"), "nowy@example.test");
    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => {
      expect(patchBody).toEqual({ guardian: { email: "nowy@example.test" } });
    });
  });

  it("dodaje i usuwa opiekuna dorosłego pacjenta", async () => {
    await expectEditGuardianPatch(
      { ...patient, guardian: null },
      async () => {
        await userEvent.click(screen.getByLabelText("Pacjent ma opiekuna"));
        await userEvent.type(screen.getByLabelText("Imię opiekuna"), "Marta");
        await userEvent.type(screen.getByLabelText("Nazwisko opiekuna"), "Opiekun");
        await userEvent.type(screen.getByLabelText("Telefon opiekuna"), "500600700");
      },
      {
        guardian: {
          firstName: "Marta",
          lastName: "Opiekun",
          phone: "500600700",
          email: null
        }
      }
    );
    await expectEditGuardianPatch(
      { ...patient, guardian: guardian() },
      async () => {
        await userEvent.click(screen.getByLabelText("Pacjent ma opiekuna"));
      },
      { guardian: null }
    );
  });

  it("nie pozwala usunąć opiekuna niepełnoletniego i nie wysyła requestu bez zmian", async () => {
    window.history.pushState({}, "", "/patients/patient-1/edit");
    let patchCount = 0;
    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/patients/patient-1" && init?.method === "PATCH") {
        patchCount += 1;
        return json(patient);
      }
      if (url === "/api/v1/patients/patient-1") {
        return json({
          ...patient,
          birthDate: "2020-01-01",
          guardian: guardian()
        });
      }
      return jsonError(404, "PATIENT_NOT_FOUND", "Nie znaleziono pacjenta.");
    });

    render(<App />);

    const checkbox = await screen.findByLabelText("Pacjent ma opiekuna");
    expect(checkbox).toBeDisabled();
    const saveButton = screen.getByRole("button", { name: "Zapisz zmiany" });
    expect(saveButton).toBeDisabled();
    await userEvent.click(saveButton);
    expect(patchCount).toBe(0);
  });

  it("rozróżnia 404 i błąd techniczny w edycji", async () => {
    await expectEditLoadError({
      response: jsonError(404, "PATIENT_NOT_FOUND", "Nie znaleziono pacjenta."),
      heading: "Nie znaleziono pacjenta",
      message: "Nie znaleziono pacjenta."
    });
    await expectEditLoadError({
      response: jsonError(500, "INTERNAL_ERROR", "Wystąpił błąd serwera.", "corr-edit"),
      heading: "Nie udało się pobrać danych pacjenta",
      message: "Wystąpił błąd serwera. Identyfikator błędu: corr-edit"
    });
  });

  it("wraca po logowaniu do chronionej trasy z query stringiem", async () => {
    sessionStorage.clear();
    window.history.pushState({}, "", "/patients?active=false&page=2");
    const urls: string[] = [];
    mockFetch(({ url, init }) => {
      urls.push(url);
      if (url === "/api/v1/auth/login" && init?.method === "POST") {
        return json({
          token: "syntetyczny-token",
          expiresAt: "2026-09-04T13:00:00.000Z",
          user: authenticatedUser
        });
      }
      if (url.startsWith("/api/v1/patients?")) {
        return json({ items: [], page: 2, pageSize: 20, total: 0, totalPages: 0 });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    await userEvent.type(await screen.findByLabelText("Login"), "staff.demo");
    await userEvent.type(screen.getByLabelText("Hasło"), "HasloTestowe123!");
    await userEvent.click(screen.getByRole("button", { name: "Zaloguj" }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/patients");
      expect(window.location.search).toBe("?active=false&page=2");
      expect(urls.some((url) => url.includes("active=false") && url.includes("page=2"))).toBe(true);
    });
  });

  it("po wejściu bezpośrednio na login wraca na panel główny i obsługuje wylogowanie", async () => {
    sessionStorage.clear();
    window.history.pushState({}, "", "/login");
    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/login" && init?.method === "POST") {
        return json({
          token: "syntetyczny-token",
          expiresAt: "2026-09-04T13:00:00.000Z",
          user: authenticatedUser
        });
      }
      if (url === "/api/v1/auth/logout" && init?.method === "POST") {
        return new Response(null, { status: 204 });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    await userEvent.type(await screen.findByLabelText("Login"), "staff.demo");
    await userEvent.type(screen.getByLabelText("Hasło"), "HasloTestowe123!");
    await userEvent.click(screen.getByRole("button", { name: "Zaloguj" }));

    expect(await screen.findByRole("heading", { name: "Panel główny" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Wyloguj" }));
    expect(await screen.findByRole("heading", { name: "Logowanie" })).toBeInTheDocument();
    expect(sessionStorage.getItem("klinika-debug-token")).toBeNull();
  });

  it("wyświetla zagnieżdżone błędy formularza i identyfikator korelacji", async () => {
    window.history.pushState({}, "", "/patients/new");

    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/patients" && init?.method === "POST") {
        return jsonError(
          422,
          "PATIENT_VALIDATION_ERROR",
          "Dane pacjenta wymagają poprawy.",
          "corr-123",
          [
            {
              field: "guardian.firstName",
              code: "REQUIRED",
              message: "Imię opiekuna jest wymagane."
            }
          ]
        );
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    await screen.findByRole("heading", { name: "Dodaj pacjenta" });
    await userEvent.type(screen.getByLabelText("Imię"), "Ala");
    await userEvent.type(screen.getByLabelText("Nazwisko"), "Mała");
    await userEvent.type(screen.getByLabelText("PESEL"), "16210112345");
    await userEvent.type(screen.getByLabelText("Data urodzenia"), "2016-01-01");
    await userEvent.type(screen.getByLabelText("Telefon opiekuna"), "500600700");
    await userEvent.click(screen.getByRole("button", { name: "Utwórz pacjenta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dane pacjenta wymagają poprawy. Identyfikator błędu: corr-123"
    );
    expect(
      screen.getByText("Imię opiekuna: Imię opiekuna jest wymagane.")
    ).toBeInTheDocument();
    const field = screen.getByLabelText("Imię opiekuna");
    const describedBy = field.getAttribute("aria-describedby");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      "Imię opiekuna jest wymagane."
    );
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

function guardian() {
  return {
    id: "guardian-1",
    firstName: "Marta",
    lastName: "Opiekun",
    phone: "500600700",
    email: "marta@example.test"
  };
}

async function fillAdultPeselForm() {
  await screen.findByRole("heading", { name: "Dodaj pacjenta" });
  await userEvent.type(screen.getByLabelText("Imię"), "Jan");
  await userEvent.type(screen.getByLabelText("Nazwisko"), "Testowy");
  await userEvent.type(screen.getByLabelText("PESEL"), "44051401458");
  await userEvent.type(screen.getByLabelText("Data urodzenia"), "1990-01-02");
  await userEvent.type(screen.getByLabelText("Telefon"), "500600700");
}

async function expectCreatePayload(
  pesel: string,
  expected: Record<string, unknown>
) {
  cleanup();
  window.history.pushState({}, "", "/patients/new");
  let postBody: Record<string, unknown> | null = null;
  mockFetch(({ url, init }) => {
    if (url === "/api/v1/auth/me") {
      return json({ user: authenticatedUser });
    }
    if (url === "/api/v1/patients" && init?.method === "POST") {
      postBody = JSON.parse(String(init.body));
      return json(patient);
    }
    if (url === "/api/v1/patients/patient-1") {
      return json(patient);
    }
    return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
  });

  render(<App />);
  await screen.findByRole("heading", { name: "Dodaj pacjenta" });
  await userEvent.type(screen.getByLabelText("Imię"), "Jan");
  await userEvent.type(screen.getByLabelText("Nazwisko"), "Testowy");
  await userEvent.type(screen.getByLabelText("PESEL"), pesel);
  await userEvent.type(
    screen.getByLabelText("Data urodzenia"),
    pesel === "16210112345" ? "2016-01-01" : "1990-01-02"
  );
  if (pesel === "16210112345") {
    await userEvent.type(screen.getByLabelText("Imię opiekuna"), "Marta");
    await userEvent.type(screen.getByLabelText("Nazwisko opiekuna"), "Opiekun");
    await userEvent.type(screen.getByLabelText("Telefon opiekuna"), "500600700");
  } else {
    await userEvent.type(screen.getByLabelText("Telefon"), "500600700");
  }
  await userEvent.click(screen.getByRole("button", { name: "Utwórz pacjenta" }));

  await waitFor(() => expect(postBody).toMatchObject(expected));
}

async function expectCreateError(code: string, message: string) {
  cleanup();
  window.history.pushState({}, "", "/patients/new");
  mockFetch(({ url, init }) => {
    if (url === "/api/v1/auth/me") {
      return json({ user: authenticatedUser });
    }
    if (url === "/api/v1/patients" && init?.method === "POST") {
      return jsonError(409, code, "Konflikt danych pacjenta.", "corr-duplicate");
    }
    return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
  });

  render(<App />);
  await fillAdultPeselForm();
  await userEvent.click(screen.getByRole("button", { name: "Utwórz pacjenta" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(message);
}

async function expectEditGuardianPatch(
  loadedPatient: typeof patient,
  change: () => Promise<void>,
  expected: Record<string, unknown>
) {
  cleanup();
  window.history.pushState({}, "", "/patients/patient-1/edit");
  let patchBody: Record<string, unknown> | null = null;
  mockFetch(({ url, init }) => {
    if (url === "/api/v1/auth/me") {
      return json({ user: authenticatedUser });
    }
    if (url === "/api/v1/patients/patient-1" && init?.method === "PATCH") {
      patchBody = JSON.parse(String(init.body));
      return json(loadedPatient);
    }
    if (url === "/api/v1/patients/patient-1") {
      return json(loadedPatient);
    }
    return jsonError(404, "PATIENT_NOT_FOUND", "Nie znaleziono pacjenta.");
  });

  render(<App />);
  await screen.findByRole("heading", { name: "Edytuj pacjenta" });
  await change();
  await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

  await waitFor(() => expect(patchBody).toEqual(expected));
}

async function expectDetailsLoadError({
  response,
  heading,
  message
}: {
  response: Response | Error;
  heading: string;
  message: string;
}) {
  cleanup();
  window.history.pushState({}, "", "/patients/patient-1");
  mockFetch(({ url }) => {
    if (url === "/api/v1/auth/me") {
      return json({ user: authenticatedUser });
    }
    if (url === "/api/v1/patients/patient-1") {
      if (response instanceof Error) {
        return Promise.reject(response);
      }
      return response;
    }
    return jsonError(404, "PATIENT_NOT_FOUND", "Nie znaleziono pacjenta.");
  });

  render(<App />);
  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  expect(screen.getByText(message)).toBeInTheDocument();
}

async function expectEditLoadError({
  response,
  heading,
  message
}: {
  response: Response;
  heading: string;
  message: string;
}) {
  cleanup();
  window.history.pushState({}, "", "/patients/patient-1/edit");
  mockFetch(({ url }) => {
    if (url === "/api/v1/auth/me") {
      return json({ user: authenticatedUser });
    }
    if (url === "/api/v1/patients/patient-1") {
      return response;
    }
    return jsonError(404, "PATIENT_NOT_FOUND", "Nie znaleziono pacjenta.");
  });

  render(<App />);
  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  expect(screen.getByText(message)).toBeInTheDocument();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function jsonError(
  status: number,
  code: string,
  message: string,
  correlationId = "corr-test",
  fieldErrors: Array<{ field: string; code: string; message: string }> = []
) {
  return json(
    {
      error: {
        code,
        message,
        correlationId,
        fieldErrors
      }
    },
    status
  );
}
