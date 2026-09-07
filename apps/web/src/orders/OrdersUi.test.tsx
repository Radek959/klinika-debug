import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  MedicalTestCatalogItem,
  MedicalTestsListResponse,
  OrderDetailsResponse,
  OrderListItem,
  PatientListItem,
  PatientsListResponse
} from "@klinika/api-contracts";
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

const annaPatient = patientListItem({
  id: "patient-1",
  firstName: "Anna",
  lastName: "Nowak",
  pesel: "44051401458"
});

const janPatient = patientListItem({
  id: "patient-2",
  firstName: "Jan",
  lastName: "Kowalski-Bardzo-Długie-Nazwisko",
  identifierType: "OTHER_DOCUMENT",
  pesel: null,
  documentType: "Paszport",
  documentNumber: "DOC123456789",
  documentCountry: "PL",
  birthDate: "1981-03-04"
});

const catalogItems: MedicalTestCatalogItem[] = [
  medicalTest({ id: "test-morf", code: "MORF", name: "Morfologia krwi", materialType: "EDTA_BLOOD" }),
  medicalTest({ id: "test-crp", code: "CRP", name: "CRP", materialType: "SERUM" }),
  medicalTest({ id: "test-tsh", code: "TSH", name: "TSH", materialType: "SERUM" }),
  medicalTest({
    id: "test-glu",
    code: "GLU",
    name: "Glukoza z bardzo długą nazwą kontrolną",
    materialType: "SERUM",
    requiredFields: [
      {
        code: "fastingConfirmed",
        label: "Potwierdzenie przygotowania pacjenta",
        valueType: "BOOLEAN",
        required: true,
        displayOrder: 1
      }
    ]
  }),
  medicalTest({ id: "test-urine", code: "URINE", name: "Badanie ogólne moczu", materialType: "URINE" })
];

const medicalTestsResponse: MedicalTestsListResponse = {
  items: catalogItems,
  page: 1,
  pageSize: 100,
  total: catalogItems.length,
  totalPages: 1
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
  status: "SAMPLE_COLLECTED",
  tests: [{ medicalTestId: "test-crp", code: "CRP", name: "CRP", materialType: "SERUM" }],
  samples: [{ materialType: "SERUM", status: "COLLECTED" }],
  externalOrderId: null,
  correlationId: null,
  sentAt: null,
  estimatedCompletionAt: null,
  createdByUserId: "user-1",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z"
};

describe("interfejs zleceń", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem("klinika-debug-token", "syntetyczny-token");
    window.history.pushState({}, "", "/orders");
  });

  afterEach(() => {
    cleanup();
  });

  it("wyświetla listę zleceń i przechodzi do szczegółów", async () => {
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url.startsWith("/api/v1/orders?")) {
        return json({ items: [orderListItem], page: 1, pageSize: 20, total: 1, totalPages: 1 });
      }
      if (url === "/api/v1/orders/order-1") {
        return json(orderDetails());
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(await screen.findByText("Anna Nowak")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Szczegóły" }));
    expect(await screen.findByRole("heading", { name: "Zlecenie: Anna Nowak" })).toBeInTheDocument();
  });

  it("pokazuje odrzucenie wszystkich próbek po polsku i komunikat o braku wyników", async () => {
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url.startsWith("/api/v1/orders/order-1/history")) {
        return json({ items: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
      }
      if (url === "/api/v1/orders/order-1") {
        return json(
          orderDetails({
            status: "REJECTED",
            tests: [
              {
                id: "order-test-1",
                medicalTestId: "test-crp",
                code: "CRP",
                name: "CRP",
                materialType: "SERUM",
                status: "REJECTED",
                additionalData: null
              }
            ],
            samples: [
              {
                id: "sample-1",
                materialType: "SERUM",
                status: "REJECTED",
                barcode: "SMP-1",
                collectedAt: "2026-09-07T10:00:00.000Z",
                collectedByUserId: "user-1",
                rejectionCode: "INSUFFICIENT_VOLUME",
                rejectionReason: "Niewystarczająca objętość próbki"
              }
            ],
            results: []
          })
        );
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    window.history.pushState({}, "", "/orders/order-1");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Zlecenie: Anna Nowak" })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Odrzucone").length).toBeGreaterThan(0);
    expect(screen.getByText("Odrzucona")).toBeInTheDocument();
    expect(
      screen.getByText(/Niewystarczająca objętość próbki \(INSUFFICIENT_VOLUME\)/)
    ).toBeInTheDocument();
    expect(
      screen.getByText("Brak wyników — laboratorium odrzuciło wymagane próbki.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/SAMPLE_REJECTED/)).not.toBeInTheDocument();
    expect(screen.queryByText("REJECTED")).not.toBeInTheDocument();
    expect(screen.queryByText("PENDING")).not.toBeInTheDocument();
  });

  it("pokazuje mieszany przypadek: część badań wykonana, jedna próbka odrzucona", async () => {
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url.startsWith("/api/v1/orders/order-1/history")) {
        return json({ items: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
      }
      if (url === "/api/v1/orders/order-1") {
        return json(
          orderDetails({
            status: "REJECTED",
            tests: [
              {
                id: "order-test-1",
                medicalTestId: "test-crp",
                code: "CRP",
                name: "CRP",
                materialType: "SERUM",
                status: "COMPLETED",
                additionalData: null
              },
              {
                id: "order-test-2",
                medicalTestId: "test-morf",
                code: "MORF",
                name: "Morfologia krwi",
                materialType: "EDTA_BLOOD",
                status: "REJECTED",
                additionalData: null
              }
            ],
            samples: [
              {
                id: "sample-1",
                materialType: "EDTA_BLOOD",
                status: "REJECTED",
                barcode: "SMP-1",
                collectedAt: "2026-09-07T10:00:00.000Z",
                collectedByUserId: "user-1",
                rejectionCode: "HEMOLYZED",
                rejectionReason: "Próbka zhemolizowana"
              },
              {
                id: "sample-2",
                materialType: "SERUM",
                status: "ACCEPTED",
                barcode: "SMP-2",
                collectedAt: "2026-09-07T10:00:00.000Z",
                collectedByUserId: "user-1",
                rejectionCode: null,
                rejectionReason: null
              }
            ],
            results: [
              {
                medicalTestId: "test-crp",
                parameters: [
                  {
                    code: "CRP",
                    value: "3.10",
                    unit: "mg/L",
                    referenceRange: null,
                    flag: "NORMAL",
                    resultedAt: "2026-09-07T11:00:00.000Z"
                  }
                ]
              }
            ]
          })
        );
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    window.history.pushState({}, "", "/orders/order-1");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Zlecenie: Anna Nowak" })
    ).toBeInTheDocument();
    expect(screen.getByText("Wykonane")).toBeInTheDocument();
    expect(screen.getByText("Zaakceptowana")).toBeInTheDocument();
    expect(screen.getByText("Odrzucona")).toBeInTheDocument();
    expect(
      screen.getByText(/Próbka zhemolizowana \(HEMOLYZED\)/)
    ).toBeInTheDocument();
    // Wyniki odebrane przed odrzuceniem pozostają widoczne.
    expect(screen.getByText("3.10")).toBeInTheDocument();
    expect(
      screen.queryByText("Brak wyników — laboratorium odrzuciło wymagane próbki.")
    ).not.toBeInTheDocument();
  });

  it("rejestruje próbkę i wysyła zlecenie do laboratorium", async () => {
    window.history.pushState({}, "", "/orders/order-1");
    let currentOrder = orderDetails();
    let registerPayload: unknown;

    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/orders/order-1/samples" && init?.method === "POST") {
        registerPayload = JSON.parse(String(init.body));
        currentOrder = orderDetails({
          status: "SAMPLE_COLLECTED",
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
          ]
        });
        return json({});
      }
      if (url === "/api/v1/orders/order-1/send" && init?.method === "POST") {
        currentOrder = orderDetails({
          status: "SENT_TO_LAB",
          externalOrderId: "EXT-123",
          sentAt: "2026-09-06T10:05:00.000Z",
          estimatedCompletionAt: "2026-09-06T10:10:00.000Z",
          samples: currentOrder.samples
        });
        return json({});
      }
      if (url === "/api/v1/orders/order-1") {
        return json(currentOrder);
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Zlecenie: Anna Nowak" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Kod kreskowy"), "SMP-0001");
    await userEvent.click(screen.getByRole("button", { name: "Zarejestruj próbkę" }));

    await waitFor(() => {
      expect(registerPayload).toMatchObject({ materialType: "SERUM", barcode: "SMP-0001" });
    });

    expect(await screen.findByText("Próbka została zarejestrowana.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Wyślij do laboratorium" }));

    expect(await screen.findByText("Zlecenie zostało wysłane do laboratorium.")).toBeInTheDocument();
    expect(await screen.findByText("EXT-123")).toBeInTheDocument();
  });

  it("pokazuje odrzucenie walidacyjne laboratorium i pozwala ponowić wysyłkę", async () => {
    window.history.pushState({}, "", "/orders/order-1");
    const collectedOrder = orderDetails({
      status: "SAMPLE_COLLECTED",
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
      ]
    });
    let sendAttempts = 0;

    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/orders/order-1/send" && init?.method === "POST") {
        sendAttempts += 1;
        return jsonError(
          422,
          "LAB_ORDER_VALIDATION_ERROR",
          "Laboratorium odrzuciło zlecenie z powodu błędów walidacji.",
          "corr-rejected-1",
          [
            {
              field: "tests",
              code: "LAB_TEST_NOT_SUPPORTED",
              message: "Laboratorium nie obsługuje jednego z wybranych badań."
            }
          ]
        );
      }
      if (url === "/api/v1/orders/order-1") {
        return json(collectedOrder);
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Zlecenie: Anna Nowak" })
    ).toBeInTheDocument();

    const sendButton = screen.getByRole("button", { name: "Wyślij do laboratorium" });
    await userEvent.click(sendButton);

    expect(
      await screen.findByText("Laboratorium odrzuciło zlecenie z powodu błędów walidacji.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Laboratorium nie obsługuje jednego z wybranych badań.")
    ).toBeInTheDocument();

    // Status zlecenia się nie zmienia, a wysyłkę można ponowić.
    expect(screen.getByText("Próbki pobrane")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Wyślij do laboratorium" })
    ).toBeEnabled();
    expect(
      screen.queryByText("Zlecenie zostało wysłane do laboratorium.")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Integracja z laboratorium")).not.toBeInTheDocument();

    // Interfejs nie pokazuje technicznych kodów ani nazwy trybu symulatora.
    expect(screen.queryByText(/LAB_ORDER_VALIDATION_ERROR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/LAB_TEST_NOT_SUPPORTED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/VALIDATION_ERROR/)).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Wyślij do laboratorium" })
    );

    await waitFor(() => {
      expect(sendAttempts).toBe(2);
    });
  });

  it("pokazuje przycisk edycji tylko dla zlecenia DRAFT", async () => {
    window.history.pushState({}, "", "/orders/order-1");
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/orders/order-1") {
        return json(orderDetails({ status: "DRAFT" }));
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(await screen.findByRole("link", { name: "Edytuj zlecenie" })).toHaveAttribute(
      "href",
      "/orders/order-1/edit"
    );

    cleanup();
    window.history.pushState({}, "", "/orders/order-1");
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/orders/order-1") {
        return json(orderDetails({ status: "SAMPLE_COLLECTED" }));
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Zlecenie: Anna Nowak" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edytuj zlecenie" })).not.toBeInTheDocument();
  });

  it("pobiera i wypełnia formularz edycji zlecenia", async () => {
    window.history.pushState({}, "", "/orders/order-1/edit");
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/orders/order-1") {
        return json(
          orderDetails({
            status: "DRAFT",
            priority: "URGENT",
            tests: [
              {
                id: "order-test-glu",
                medicalTestId: "test-glu",
                status: "PENDING",
                code: "GLU",
                name: "Glukoza z bardzo długą nazwą kontrolną",
                materialType: "SERUM",
                additionalData: { fastingConfirmed: false }
              }
            ]
          })
        );
      }
      if (url === "/api/v1/tests?pageSize=100") {
        return json(medicalTestsResponse);
      }
      if (url.startsWith("/api/v1/patients?")) {
        return json(patientsResponse([annaPatient]));
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Edycja zlecenia: Anna Nowak" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Wybrany pacjent" })).toHaveTextContent("Nowak Anna");
    expect(screen.getByLabelText("Priorytet")).toHaveValue("URGENT");
    expect(await screen.findByLabelText(/Glukoza/)).toBeChecked();
    expect(screen.getByLabelText("Potwierdzenie przygotowania pacjenta")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Zapisz zmiany" })).toBeDisabled();
  });

  it("wysyła tylko zmieniony priorytet i przekierowuje po sukcesie", async () => {
    window.history.pushState({}, "", "/orders/order-1/edit");
    let patchPayload: unknown;
    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/orders/order-1" && init?.method === "PATCH") {
        patchPayload = JSON.parse(String(init.body));
        return json(orderDetails({ status: "DRAFT", priority: "URGENT" }));
      }
      if (url === "/api/v1/orders/order-1") {
        return json(orderDetails({ status: "DRAFT", priority: "ROUTINE" }));
      }
      if (url === "/api/v1/tests?pageSize=100") {
        return json(medicalTestsResponse);
      }
      if (url.startsWith("/api/v1/patients?")) {
        return json(patientsResponse([annaPatient]));
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    await userEvent.selectOptions(await screen.findByLabelText("Priorytet"), "URGENT");
    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(patchPayload).toEqual({ priority: "URGENT" }));
    expect(await screen.findByText("Zlecenie zostało zaktualizowane.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Zlecenie: Anna Nowak" })).toBeInTheDocument();
  });

  it("pokazuje błędy edycji bez czyszczenia formularza i z correlationId", async () => {
    window.history.pushState({}, "", "/orders/order-1/edit");
    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/orders/order-1" && init?.method === "PATCH") {
        return jsonError(422, "ORDER_UPDATE_ERROR", "Nie udało się zaktualizować zlecenia.", "corr-edit", [
          {
            field: "tests.0.additionalData.fastingConfirmed",
            code: "REQUIRED_CONFIRMATION",
            message: "Potwierdzenie jest wymagane."
          }
        ]);
      }
      if (url === "/api/v1/orders/order-1") {
        return json(
          orderDetails({
            status: "DRAFT",
            tests: [
              {
                id: "order-test-glu",
                medicalTestId: "test-glu",
                status: "PENDING",
                code: "GLU",
                name: "Glukoza z bardzo długą nazwą kontrolną",
                materialType: "SERUM",
                additionalData: { fastingConfirmed: false }
              }
            ]
          })
        );
      }
      if (url === "/api/v1/tests?pageSize=100") {
        return json(medicalTestsResponse);
      }
      if (url.startsWith("/api/v1/patients?")) {
        return json(patientsResponse([annaPatient]));
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    await userEvent.click(await screen.findByLabelText("Potwierdzenie przygotowania pacjenta"));
    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    expect(await screen.findByText(/corr-edit/)).toBeInTheDocument();
    expect(screen.getByText("Potwierdzenie jest wymagane.")).toBeInTheDocument();
    expect(screen.getByLabelText("Potwierdzenie przygotowania pacjenta")).toBeChecked();
  });

  it("pokazuje osobny komunikat dla zlecenia nieedytowalnego", async () => {
    window.history.pushState({}, "", "/orders/order-1/edit");
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/orders/order-1") {
        return json(orderDetails({ status: "SAMPLE_COLLECTED" }));
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Tego zlecenia nie można edytować" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Wróć do szczegółów" })).toHaveAttribute(
      "href",
      "/orders/order-1"
    );
  });

  it("zastępuje ręczne patientId wyszukiwanym pickerem aktywnych pacjentów", async () => {
    const patientRequests: string[] = [];
    renderNewOrder(({ url }) => {
      if (url.startsWith("/api/v1/patients?")) {
        patientRequests.push(url);
        return json(patientsResponse([annaPatient]));
      }
      return undefined;
    });

    expect(await screen.findByRole("heading", { name: "Nowe zlecenie" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Identyfikator pacjenta")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dodaj nowego pacjenta" })).toHaveAttribute("href", "/patients/new");

    await userEvent.type(screen.getByRole("combobox", { name: "Pacjent" }), "Nowak");

    await waitFor(() => {
      expect(
        patientRequests.some((url) => {
          const params = new URL(url, "http://localhost").searchParams;
          return (
            params.get("active") === "true" &&
            params.get("page") === "1" &&
            params.get("pageSize") === "10" &&
            params.get("search") === "Nowak"
          );
        })
      ).toBe(true);
    });
  });

  it("pokazuje loading, brak wyników oraz błąd i retry wyszukiwania pacjentów", async () => {
    const loadingResponse = createDeferred<Response>();
    renderNewOrder(({ url }) => {
      if (url.startsWith("/api/v1/patients?")) {
        return loadingResponse.promise;
      }
      return undefined;
    });

    await userEvent.type(await screen.findByRole("combobox", { name: "Pacjent" }), "Anna");
    expect(await screen.findByText("Ładowanie pacjentów...")).toBeInTheDocument();
    loadingResponse.resolve(json(patientsResponse([])));
    expect(await screen.findByText("Brak wyników dla podanych danych.")).toBeInTheDocument();

    cleanup();
    let calls = 0;
    renderNewOrder(({ url }) => {
      if (url.startsWith("/api/v1/patients?")) {
        calls += 1;
        return calls === 1
          ? jsonError(503, "PATIENTS_UNAVAILABLE", "Nie udało się pobrać pacjentów.", "corr-patients")
          : json(patientsResponse([annaPatient]));
      }
      return undefined;
    });

    await userEvent.type(await screen.findByRole("combobox", { name: "Pacjent" }), "Anna");
    expect(await screen.findByText(/corr-patients/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ponów wyszukiwanie" }));
    expect(await screen.findByText("Nowak Anna")).toBeInTheDocument();
  });

  it("pozwala wybrać, wyczyścić i obsłużyć pacjenta klawiaturą bez ujawniania ID", async () => {
    renderNewOrder(({ url }) => {
      if (url.startsWith("/api/v1/patients?")) {
        return json(patientsResponse([annaPatient, janPatient]));
      }
      return undefined;
    });

    const input = await screen.findByRole("combobox", { name: "Pacjent" });
    await userEvent.type(input, "Kow");
    expect(await screen.findByText("Nowak Anna")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByRole("region", { name: "Wybrany pacjent" })).toHaveTextContent(
      "Kowalski-Bardzo-Długie-Nazwisko Jan"
    );
    expect(screen.getByText("Paszport / PL: końcówka 6789")).toBeInTheDocument();
    expect(screen.queryByText("patient-2")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Wyczyść wybór" }));
    expect(screen.getByRole("combobox", { name: "Pacjent" })).toHaveValue("");
  });

  it("chroni wyniki pacjentów przed starszą odpowiedzią requestu", async () => {
    const responses = new Map<string, Deferred<Response>>();
    renderNewOrder(({ url }) => {
      if (url.startsWith("/api/v1/patients?")) {
        const search = new URL(url, "http://localhost").searchParams.get("search") ?? "";
        const deferred = createDeferred<Response>();
        responses.set(search, deferred);
        return deferred.promise;
      }
      return undefined;
    });

    const input = await screen.findByRole("combobox", { name: "Pacjent" });
    await userEvent.type(input, "Anna");
    await waitFor(() => expect(responses.has("Anna")).toBe(true));
    await userEvent.clear(input);
    await userEvent.type(input, "Jan");
    await waitFor(() => expect(responses.has("Jan")).toBe(true));

    responses.get("Jan")?.resolve(json(patientsResponse([janPatient])));
    expect(await screen.findByText("Kowalski-Bardzo-Długie-Nazwisko Jan")).toBeInTheDocument();

    responses.get("Anna")?.resolve(json(patientsResponse([annaPatient])));
    await waitFor(() => expect(screen.queryByText("Nowak Anna")).not.toBeInTheDocument());
  });

  it("wyświetla katalog badań, zaznaczenie i pola dodatkowe bez rozciągania checkboxa", async () => {
    renderNewOrder();

    const crpCheckbox = await screen.findByLabelText(/CRP/);
    expect(crpCheckbox).toHaveAttribute("type", "checkbox");
    expect(crpCheckbox).toHaveClass("order-checkbox");
    expect(screen.getAllByText("Surowica").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5 min").length).toBeGreaterThan(0);

    await userEvent.click(crpCheckbox);
    expect(screen.getByLabelText(/CRP/)).toBeChecked();
    await userEvent.click(screen.getByLabelText(/CRP/));
    expect(screen.getByLabelText(/CRP/)).not.toBeChecked();

    await userEvent.click(screen.getByLabelText(/Glukoza/));
    const additionalField = screen.getByLabelText("Potwierdzenie przygotowania pacjenta");
    expect(additionalField).toHaveAttribute("type", "checkbox");
    expect(additionalField).not.toBeChecked();
    await userEvent.click(screen.getByLabelText(/Glukoza/));
    expect(screen.queryByLabelText("Potwierdzenie przygotowania pacjenta")).not.toBeInTheDocument();
  });

  it("zachowuje false w payloadzie i usuwa dane dodatkowe po odznaczeniu", async () => {
    let payloads: unknown[] = [];
    renderNewOrder(({ url, init }) => {
      if (url === "/api/v1/orders" && init?.method === "POST") {
        payloads = [...payloads, JSON.parse(String(init.body))];
        return json(orderDetails({ id: `order-${payloads.length + 1}` }), 201);
      }
      return undefined;
    });

    await selectAnna();
    await userEvent.click(await screen.findByLabelText(/Glukoza/));
    await userEvent.click(screen.getByRole("button", { name: "Utwórz zlecenie" }));

    await waitFor(() => {
      expect(payloads[0]).toMatchObject({
        patientId: "patient-1",
        tests: [{ medicalTestId: "test-glu", additionalData: { fastingConfirmed: false } }]
      });
    });

    window.history.pushState({}, "", "/orders/new");
    cleanup();
    payloads = [];
    renderNewOrder(({ url, init }) => {
      if (url === "/api/v1/orders" && init?.method === "POST") {
        payloads = [...payloads, JSON.parse(String(init.body))];
        return json(orderDetails({ id: "order-3" }), 201);
      }
      return undefined;
    });

    await selectAnna();
    await userEvent.click(await screen.findByLabelText(/Glukoza/));
    await userEvent.click(screen.getByLabelText("Potwierdzenie przygotowania pacjenta"));
    await userEvent.click(screen.getByLabelText(/Glukoza/));
    await userEvent.click(screen.getByLabelText(/CRP/));
    await userEvent.click(screen.getByRole("button", { name: "Utwórz zlecenie" }));

    await waitFor(() => {
      expect(payloads[0]).toMatchObject({ tests: [{ medicalTestId: "test-crp" }] });
      expect(JSON.stringify(payloads[0])).not.toContain("fastingConfirmed");
    });
  });

  it("mapuje błąd API do pola dodatkowego badania", async () => {
    renderNewOrder(({ url, init }) => {
      if (url === "/api/v1/orders" && init?.method === "POST") {
        return jsonError(422, "ORDER_VALIDATION", "Nie udało się zapisać zlecenia.", "corr-order", [
          {
            field: "tests.0.additionalData.fastingConfirmed",
            code: "REQUIRED_CONFIRMATION",
            message: "Potwierdzenie jest wymagane."
          }
        ]);
      }
      return undefined;
    });

    await selectAnna();
    await userEvent.click(await screen.findByLabelText(/Glukoza/));
    await userEvent.click(screen.getByRole("button", { name: "Utwórz zlecenie" }));

    const additionalField = await screen.findByLabelText("Potwierdzenie przygotowania pacjenta");
    expect(additionalField).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Potwierdzenie jest wymagane.")).toBeInTheDocument();
    expect(screen.getByText(/corr-order/)).toBeInTheDocument();
  });

  it("pokazuje podsumowanie i grupuje materiały w stabilnej kolejności", async () => {
    renderNewOrder();

    await selectAnna();
    await userEvent.click(await screen.findByLabelText(/Badanie ogólne moczu/));
    await userEvent.click(screen.getByLabelText(/CRP/));
    await userEvent.click(screen.getByLabelText(/Morfologia krwi/));

    const summary = within(screen.getByRole("region", { name: "Podsumowanie zlecenia" }));
    expect(summary.getByText("Nowak Anna")).toBeInTheDocument();
    expect(summary.getByText("Rutynowe")).toBeInTheDocument();
    expect(summary.getByText("Liczba badań: 3")).toBeInTheDocument();
    expect(summary.getByText("Morfologia krwi (MORF)")).toBeInTheDocument();
    expect(summary.getByText("CRP (CRP)")).toBeInTheDocument();
    expect(summary.getByText("Badanie ogólne moczu (URINE)")).toBeInTheDocument();

    const materials = summary.getByText("Wymagane próbki").nextElementSibling;
    expect(materials?.textContent).toMatch(/Krew \(EDTA\).*Surowica.*Mocz/);
  });

  it("blokuje niekompletny formularz, wysyła poprawny payload i przekierowuje po sukcesie", async () => {
    let createdPayload: unknown;
    renderNewOrder(({ url, init }) => {
      if (url === "/api/v1/orders" && init?.method === "POST") {
        createdPayload = JSON.parse(String(init.body));
        return json(orderDetails({ id: "order-2" }), 201);
      }
      if (url === "/api/v1/orders/order-2") {
        return json(orderDetails({ id: "order-2" }));
      }
      return undefined;
    });

    const submitButton = await screen.findByRole("button", { name: "Utwórz zlecenie" });
    expect(submitButton).toBeDisabled();
    expect(screen.getByText("wybierz pacjenta")).toBeInTheDocument();
    expect(screen.getByText("zaznacz co najmniej jedno badanie")).toBeInTheDocument();

    await selectAnna();
    await userEvent.selectOptions(screen.getByLabelText("Priorytet"), "URGENT");
    await userEvent.click(await screen.findByLabelText(/CRP/));
    await userEvent.click(screen.getByRole("button", { name: "Utwórz zlecenie" }));

    await waitFor(() => {
      expect(createdPayload).toEqual({
        patientId: "patient-1",
        priority: "URGENT",
        tests: [{ medicalTestId: "test-crp" }]
      });
    });
    expect(await screen.findByText("Zlecenie zostało utworzone.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Zlecenie: Anna Nowak" })).toBeInTheDocument();
  });

  it("pokazuje błąd zapisu bez utraty wprowadzonych danych", async () => {
    renderNewOrder(({ url, init }) => {
      if (url === "/api/v1/orders" && init?.method === "POST") {
        return jsonError(500, "ORDER_SAVE_FAILED", "Nie udało się utworzyć zlecenia.", "corr-save");
      }
      return undefined;
    });

    await selectAnna();
    await userEvent.click(await screen.findByLabelText(/CRP/));
    await userEvent.click(screen.getByRole("button", { name: "Utwórz zlecenie" }));

    expect(await screen.findByText(/corr-save/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Wybrany pacjent" })).toHaveTextContent("Nowak Anna");
    expect(screen.getByLabelText(/CRP/)).toBeChecked();
  });
});

async function selectAnna() {
  await userEvent.type(await screen.findByRole("combobox", { name: "Pacjent" }), "Anna");
  await userEvent.click(await screen.findByText("Nowak Anna"));
}

function renderNewOrder(
  override?: (request: { url: string; init?: RequestInit }) => Response | Promise<Response> | undefined
) {
  window.history.pushState({}, "", "/orders/new");
  mockFetch((request) => {
    const overridden = override?.(request);
    if (overridden) {
      return overridden;
    }
    const { url, init } = request;
    if (url === "/api/v1/auth/me") {
      return json({ user: authenticatedUser });
    }
    if (url === "/api/v1/tests?pageSize=100") {
      return json(medicalTestsResponse);
    }
    if (url.startsWith("/api/v1/patients?")) {
      return json(patientsResponse([annaPatient]));
    }
    if (url === "/api/v1/orders" && init?.method === "POST") {
      return json(orderDetails({ id: "order-2" }), 201);
    }
    if (url === "/api/v1/orders/order-2") {
      return json(orderDetails({ id: "order-2" }));
    }
    return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
  });

  render(<App />);
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
      createdAt: "2026-09-01T09:00:00.000Z",
      updatedAt: "2026-09-01T09:30:00.000Z"
    },
    priority: "ROUTINE",
    status: "SAMPLE_COLLECTED",
    tests: [{ id: "order-test-1", medicalTestId: "test-crp", code: "CRP", name: "CRP", materialType: "SERUM", status: "PENDING", additionalData: null }],
    samples: [
      { id: "sample-1", materialType: "SERUM", status: "REQUIRED", barcode: null, collectedAt: null, collectedByUserId: null, rejectionCode: null, rejectionReason: null }
    ],
    externalOrderId: null,
    correlationId: null,
    sentAt: null,
    estimatedCompletionAt: null,
    createdByUserId: "user-1",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    results: [],
    ...overrides
  };
}

function patientListItem(overrides: Partial<PatientListItem> = {}): PatientListItem {
  return {
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
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides
  };
}

function patientsResponse(items: PatientListItem[]): PatientsListResponse {
  return {
    items,
    page: 1,
    pageSize: 10,
    total: items.length,
    totalPages: items.length ? 1 : 0
  };
}

function medicalTest(
  overrides: Partial<MedicalTestCatalogItem> & Pick<MedicalTestCatalogItem, "id" | "code" | "name" | "materialType">
): MedicalTestCatalogItem {
  return {
    description: "Opis badania",
    estimatedDurationMinutes: 5,
    active: true,
    parameters: [],
    requiredFields: [],
    ...overrides
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
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
