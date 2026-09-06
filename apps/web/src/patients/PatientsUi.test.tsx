import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const patient = {
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
  });
});

function mockFetch(
  handler: (request: { url: string; init?: RequestInit }) => Response
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
