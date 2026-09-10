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
  totalPages: 1,
  catalogFlag: false
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

  it("odtwarza filtr statusu z query stringa (deep link z dashboardu)", async () => {
    window.history.pushState({}, "", "/orders?status=COMPLETED");
    const requestedUrls: string[] = [];
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url.startsWith("/api/v1/orders?")) {
        requestedUrls.push(url);
        return json({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Zlecenia" })).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toHaveValue("COMPLETED");
    await waitFor(() => {
      expect(
        requestedUrls.some((url) => new URL(url, "http://localhost").searchParams.get("status") === "COMPLETED")
      ).toBe(true);
    });
  });

  it("linkuje imię i nazwisko pacjenta w szczegółach zlecenia do jego profilu", async () => {
    window.history.pushState({}, "", "/orders/order-1");
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/orders/order-1") {
        return json(orderDetails());
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Zlecenie: Anna Nowak" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Anna Nowak" })).toHaveAttribute(
      "href",
      "/patients/patient-1"
    );
  });

  it("pokazuje stepper postępu z opisem stanu, nie tylko kolorem", async () => {
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

    const stepper = await screen.findByRole("list", { name: "Postęp zlecenia" });
    const items = within(stepper).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "✓Zlecenie (zakończono)",
      "✓Próbki (zakończono)",
      "●Laboratorium (w trakcie)",
      "○Wynik (oczekuje)"
    ]);
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

  it("pokazuje ograniczenie przepustowości laboratorium i zapowiedź automatycznego ponowienia", async () => {
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
        return rateLimitError(15);
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
    await userEvent.click(screen.getByRole("button", { name: "Wyślij do laboratorium" }));

    expect(
      await screen.findByText(
        "Laboratorium chwilowo ograniczyło liczbę żądań. Wysyłka zostanie ponowiona automatycznie."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Kolejna próba za około 15 sekund.")).toBeInTheDocument();

    // Brak fałszywego komunikatu sukcesu — zlecenie nie zostało jeszcze wysłane.
    expect(screen.getByText("Próbki pobrane")).toBeInTheDocument();
    expect(
      screen.queryByText("Zlecenie zostało wysłane do laboratorium.")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Integracja z laboratorium")).not.toBeInTheDocument();

    // Interfejs nie pokazuje surowych kodów ani nazwy trybu symulatora.
    expect(screen.queryByText(/LAB_RATE_LIMITED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/RATE_LIMIT/)).not.toBeInTheDocument();

    // Automatyczne ponowienie jest już zaplanowane — pokazywanie "Wyślij do
    // laboratorium" obok tego komunikatu byłoby mylące, więc przycisk znika.
    // Jedyną dostępną akcją zostaje ręczne "Odśwież status".
    expect(
      screen.queryByRole("button", { name: "Wyślij do laboratorium" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Odśwież status" })).toBeInTheDocument();
    expect(sendAttempts).toBe(1);
  });

  it("odświeża historię po zapisanym ograniczeniu przepustowości (429)", async () => {
    window.history.pushState({}, "", "/orders/order-1");
    const collectedOrder = sendableOrderDetails();
    let historyRequests = 0;
    let orderRequests = 0;

    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url.startsWith("/api/v1/orders/order-1/history")) {
        historyRequests += 1;
        // Backend zapisuje wpis LAB_RATE_LIMIT_RECEIVED dopiero przy odpowiedzi
        // 429, więc pierwsze pobranie historii jest jeszcze puste.
        return json(
          historyRequests === 1
            ? historyListResponse([])
            : historyListResponse([rateLimitHistoryItem()])
        );
      }
      if (url === "/api/v1/orders/order-1/send" && init?.method === "POST") {
        return rateLimitError(15);
      }
      if (url === "/api/v1/orders/order-1") {
        orderRequests += 1;
        return json(collectedOrder);
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(
      await screen.findByText("Brak zarejestrowanych zdarzeń dla tego zlecenia.")
    ).toBeInTheDocument();
    expect(historyRequests).toBe(1);
    expect(orderRequests).toBe(1);

    await userEvent.click(screen.getByRole("button", { name: "Wyślij do laboratorium" }));

    // Nowy wpis pojawia się bez ręcznego odświeżenia strony.
    expect(
      await screen.findByText("Laboratorium ograniczyło liczbę żądań")
    ).toBeInTheDocument();
    await waitFor(() => expect(historyRequests).toBe(2));

    // Komunikat błędu zostaje, sukcesu nie ma, a szczegóły zlecenia nie są
    // pobierane ponownie — status zlecenia się nie zmienił.
    expect(
      screen.getByText(
        "Laboratorium chwilowo ograniczyło liczbę żądań. Wysyłka zostanie ponowiona automatycznie."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Zlecenie zostało wysłane do laboratorium.")
    ).not.toBeInTheDocument();
    expect(orderRequests).toBe(1);
  });

  it("pokazuje chwilową niedostępność laboratorium i odświeża historię po 503", async () => {
    window.history.pushState({}, "", "/orders/order-1");
    const collectedOrder = sendableOrderDetails();
    let historyRequests = 0;
    let orderRequests = 0;

    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url.startsWith("/api/v1/orders/order-1/history")) {
        historyRequests += 1;
        return json(
          historyRequests === 1
            ? historyListResponse([])
            : historyListResponse([serverErrorRetryHistoryItem()])
        );
      }
      if (url === "/api/v1/orders/order-1/send" && init?.method === "POST") {
        return serverError(15);
      }
      if (url === "/api/v1/orders/order-1") {
        orderRequests += 1;
        return json(collectedOrder);
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(
      await screen.findByText("Brak zarejestrowanych zdarzeń dla tego zlecenia.")
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Wyślij do laboratorium" }));

    expect(
      await screen.findByText(
        "Laboratorium jest chwilowo niedostępne. Wysyłka zostanie ponowiona automatycznie."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Kolejna próba za około 15 sekund.")).toBeInTheDocument();
    expect(await screen.findByText("Automatyczne ponowienie wysyłki")).toBeInTheDocument();
    await waitFor(() => expect(historyRequests).toBe(2));

    expect(screen.getByText("Próbki pobrane")).toBeInTheDocument();
    expect(
      screen.queryByText("Zlecenie zostało wysłane do laboratorium.")
    ).not.toBeInTheDocument();
    expect(orderRequests).toBe(1);
    expect(screen.queryByText(/LAB_SERVER_ERROR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SERVER_ERROR/)).not.toBeInTheDocument();
  });

  it(
    "pokazuje timeout laboratorium (504), odświeża historię i pozwala ręcznie " +
      "'Odśwież status' mimo pozostania w SAMPLE_COLLECTED",
    async () => {
      window.history.pushState({}, "", "/orders/order-1");
      const collectedOrder = sendableOrderDetails();
      let historyRequests = 0;
      let orderRequests = 0;

      mockFetch(({ url, init }) => {
        if (url === "/api/v1/auth/me") {
          return json({ user: authenticatedUser });
        }
        if (url.startsWith("/api/v1/orders/order-1/history")) {
          historyRequests += 1;
          return json(
            historyRequests === 1
              ? historyListResponse([])
              : historyListResponse([sendTimeoutHistoryItem()])
          );
        }
        if (url === "/api/v1/orders/order-1/send" && init?.method === "POST") {
          return timeoutError(15);
        }
        if (url === "/api/v1/orders/order-1") {
          orderRequests += 1;
          if (orderRequests === 1) {
            return json(collectedOrder);
          }
          // Ręczny 'Odśwież status' po zaplanowanym retry — backend może już
          // zwrócić zaktualizowany status.
          return json(orderDetails({ status: "SENT_TO_LAB" }));
        }
        return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
      });

      render(<App />);

      expect(
        await screen.findByText("Brak zarejestrowanych zdarzeń dla tego zlecenia.")
      ).toBeInTheDocument();
      // Świeże SAMPLE_COLLECTED przed jakąkolwiek wysyłką nie pokazuje jeszcze
      // przycisku ręcznego odświeżenia.
      expect(screen.queryByRole("button", { name: "Odśwież status" })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Wyślij do laboratorium" }));

      expect(
        await screen.findByText(
          "Timeout wysyłki do laboratorium. Wysyłka zostanie ponowiona automatycznie."
        )
      ).toBeInTheDocument();
      expect(screen.getByText("Kolejna próba za około 15 sekund.")).toBeInTheDocument();
      await waitFor(() => expect(historyRequests).toBe(2));
      expect(await screen.findByText("Timeout wysyłki do laboratorium")).toBeInTheDocument();

      // Zlecenie zostaje w SAMPLE_COLLECTED, ale backend zaplanował
      // automatyczne ponowienie — 'Odśwież status' musi być dostępne mimo
      // niezmienionego lokalnego statusu.
      expect(screen.getByText("Próbki pobrane")).toBeInTheDocument();
      expect(orderRequests).toBe(1);
      expect(screen.queryByText(/LAB_SEND_TIMEOUT/)).not.toBeInTheDocument();
      expect(screen.queryByText(/^TIMEOUT$/)).not.toBeInTheDocument();

      const refreshButton = await screen.findByRole("button", { name: "Odśwież status" });
      await userEvent.click(refreshButton);

      expect(await screen.findByText("Wysłane do laboratorium")).toBeInTheDocument();
      expect(orderRequests).toBe(2);
      // Po zmianie statusu zlecenie nie jest już w SAMPLE_COLLECTED, więc
      // przycisk wraca do zwykłej reguły widoczności (SENT_TO_LAB ją nadal
      // pokazuje).
      expect(screen.getByRole("button", { name: "Odśwież status" })).toBeEnabled();
    }
  );

  it(
    "nie pokazuje przycisku 'Odśwież status' dla świeżego SAMPLE_COLLECTED " +
      "przed pierwszą wysyłką do laboratorium",
    async () => {
      window.history.pushState({}, "", "/orders/order-1");
      mockFetch(({ url }) => {
        if (url === "/api/v1/auth/me") {
          return json({ user: authenticatedUser });
        }
        if (url.startsWith("/api/v1/orders/order-1/history")) {
          return json(historyListResponse([]));
        }
        if (url === "/api/v1/orders/order-1") {
          return json(sendableOrderDetails());
        }
        return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
      });

      render(<App />);

      expect(
        await screen.findByRole("heading", { name: "Zlecenie: Anna Nowak" })
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Odśwież status" })).not.toBeInTheDocument();
    }
  );

  it(
    "pokazuje 'Odśwież status' od razu po wejściu w zlecenie (F5 / nawigacja), " +
      "gdy backend zgłasza trwające ponowienie wysyłki (labSendRetryPending)",
    async () => {
      // Bez żadnego kliknięcia „Wyślij do laboratorium” w TEJ instancji strony —
      // informacja o trwającym retry musi pochodzić WYŁĄCZNIE z odpowiedzi API,
      // symulując ponowne wejście w szczegóły zlecenia (F5 / powrót z listy) po
      // wcześniejszym 429/503/504 w innej instancji strony.
      window.history.pushState({}, "", "/orders/order-1");
      mockFetch(({ url }) => {
        if (url === "/api/v1/auth/me") {
          return json({ user: authenticatedUser });
        }
        if (url.startsWith("/api/v1/orders/order-1/history")) {
          return json(historyListResponse([]));
        }
        if (url === "/api/v1/orders/order-1") {
          return json(sendableOrderDetails({ labSendRetryPending: true }));
        }
        return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
      });

      render(<App />);

      expect(
        await screen.findByRole("heading", { name: "Zlecenie: Anna Nowak" })
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Odśwież status" })).toBeInTheDocument();
      // Pokazywanie "Wyślij do laboratorium" obok "Odśwież status" byłoby
      // mylące — backend już ponawia wysyłkę w tle.
      expect(
        screen.queryByRole("button", { name: "Wyślij do laboratorium" })
      ).not.toBeInTheDocument();
    }
  );

  it(
    "nie pokazuje 'Odśwież status' dla zwykłego SAMPLE_COLLECTED bez trwającego " +
      "retry (labSendRetryPending: false), mimo że zlecenie było już kiedyś wysyłane",
    async () => {
      window.history.pushState({}, "", "/orders/order-1");
      mockFetch(({ url }) => {
        if (url === "/api/v1/auth/me") {
          return json({ user: authenticatedUser });
        }
        if (url.startsWith("/api/v1/orders/order-1/history")) {
          return json(historyListResponse([]));
        }
        if (url === "/api/v1/orders/order-1") {
          return json(sendableOrderDetails({ labSendRetryPending: false }));
        }
        return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
      });

      render(<App />);

      expect(
        await screen.findByRole("heading", { name: "Zlecenie: Anna Nowak" })
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Odśwież status" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Wyślij do laboratorium" })).toBeInTheDocument();
    }
  );

  it("odświeża historię po zapisanym odrzuceniu walidacyjnym (422)", async () => {
    window.history.pushState({}, "", "/orders/order-1");
    const collectedOrder = sendableOrderDetails();
    let historyRequests = 0;
    let orderRequests = 0;

    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url.startsWith("/api/v1/orders/order-1/history")) {
        historyRequests += 1;
        return json(
          historyRequests === 1
            ? historyListResponse([])
            : historyListResponse([orderRejectedHistoryItem()])
        );
      }
      if (url === "/api/v1/orders/order-1/send" && init?.method === "POST") {
        return jsonError(
          422,
          "LAB_ORDER_VALIDATION_ERROR",
          "Laboratorium odrzuciło zlecenie z powodu błędów walidacji.",
          "corr-rejected-2",
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
        orderRequests += 1;
        return json(collectedOrder);
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(
      await screen.findByText("Brak zarejestrowanych zdarzeń dla tego zlecenia.")
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Wyślij do laboratorium" }));

    expect(
      await screen.findByText("Laboratorium odrzuciło zlecenie")
    ).toBeInTheDocument();
    await waitFor(() => expect(historyRequests).toBe(2));

    expect(
      screen.getByText("Laboratorium odrzuciło zlecenie z powodu błędów walidacji.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Zlecenie zostało wysłane do laboratorium.")
    ).not.toBeInTheDocument();
    expect(orderRequests).toBe(1);
  });

  it("nie odświeża historii po błędzie, który nie zapisuje żadnego zdarzenia", async () => {
    window.history.pushState({}, "", "/orders/order-1");
    const collectedOrder = sendableOrderDetails();
    let historyRequests = 0;

    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url.startsWith("/api/v1/orders/order-1/history")) {
        historyRequests += 1;
        return json(historyListResponse([]));
      }
      if (url === "/api/v1/orders/order-1/send" && init?.method === "POST") {
        // Lokalna reguła biznesowa — backend nie zapisuje wpisu historii.
        return jsonError(
          422,
          "ORDER_SEND_ERROR",
          "Nie udało się wysłać zlecenia do laboratorium.",
          "corr-send-error",
          [
            {
              field: "patientId",
              code: "PATIENT_INACTIVE",
              message: "Nie można wysłać zlecenia dla nieaktywnego pacjenta."
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
      await screen.findByText("Brak zarejestrowanych zdarzeń dla tego zlecenia.")
    ).toBeInTheDocument();
    expect(historyRequests).toBe(1);

    await userEvent.click(screen.getByRole("button", { name: "Wyślij do laboratorium" }));

    expect(
      await screen.findByText("Nie można wysłać zlecenia dla nieaktywnego pacjenta.")
    ).toBeInTheDocument();
    // Brak zapisanego zdarzenia oznacza brak powodu do ponownego odpytania.
    expect(historyRequests).toBe(1);
  });

  it("informuje o automatycznym ponowieniu także bez nagłówka Retry-After", async () => {
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

    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/orders/order-1/send" && init?.method === "POST") {
        return rateLimitError();
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
    await userEvent.click(screen.getByRole("button", { name: "Wyślij do laboratorium" }));

    // Bez odczytanej liczby sekund nie podajemy zmyślonego czasu.
    expect(
      await screen.findByText("Kolejna próba zostanie wykonana automatycznie.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Kolejna próba za około/)).not.toBeInTheDocument();
  });

  it("pokazuje correlationId błędu wysyłki z przyciskiem Kopiuj", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    window.history.pushState({}, "", "/orders/order-1");
    const collectedOrder = sendableOrderDetails();

    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/orders/order-1/send" && init?.method === "POST") {
        return jsonError(
          422,
          "LAB_ORDER_VALIDATION_ERROR",
          "Laboratorium odrzuciło zlecenie z powodu błędów walidacji.",
          "corr-copy-send"
        );
      }
      if (url.startsWith("/api/v1/orders/order-1/history")) {
        return json(historyListResponse([]));
      }
      if (url === "/api/v1/orders/order-1") {
        return json(collectedOrder);
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Wyślij do laboratorium" })
    );

    expect(await screen.findByText("corr-copy-send")).toBeInTheDocument();
    const copyButtons = screen.getAllByRole("button", { name: "Kopiuj" });
    await userEvent.click(copyButtons[0]);
    expect(writeText).toHaveBeenCalledWith("corr-copy-send");
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

  it.each(["SENT_TO_LAB", "PROCESSING", "PARTIAL"] as const)(
    "pokazuje przycisk 'Odśwież status' dla statusu %s i pozwala ręcznie pobrać nowe dane bez przeładowania strony",
    async (status) => {
      window.history.pushState({}, "", "/orders/order-1");
      let orderRequests = 0;
      const deferredSecondResponse = createDeferred<Response>();

      mockFetch(({ url }) => {
        if (url === "/api/v1/auth/me") {
          return json({ user: authenticatedUser });
        }
        if (url.startsWith("/api/v1/orders/order-1/history")) {
          return json(historyListResponse([]));
        }
        if (url === "/api/v1/orders/order-1") {
          orderRequests += 1;
          if (orderRequests === 1) {
            return json(orderDetails({ status }));
          }
          return deferredSecondResponse.promise;
        }
        return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
      });

      render(<App />);

      const refreshButton = await screen.findByRole("button", { name: "Odśwież status" });
      expect(orderRequests).toBe(1);

      await userEvent.click(refreshButton);
      expect(orderRequests).toBe(2);
      expect(await screen.findByRole("button", { name: "Odświeżanie..." })).toBeDisabled();
      // Treść zlecenia pozostaje na ekranie w trakcie odświeżania — brak
      // przeładowania całej strony.
      expect(screen.getByRole("heading", { name: "Zlecenie: Anna Nowak" })).toBeInTheDocument();

      deferredSecondResponse.resolve(json(orderDetails({ status: "COMPLETED" })));

      // Po odświeżeniu status się zmienił na zakończony — przycisk znika,
      // bo zlecenie nie oczekuje już na laboratorium.
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: "Odśwież status" })).not.toBeInTheDocument();
      });
      expect(screen.queryByRole("button", { name: "Odświeżanie..." })).not.toBeInTheDocument();
    }
  );

  it("aktualizuje status po kliknięciu 'Odśwież status' i nie dodaje żadnego automatycznego pollingu", async () => {
    window.history.pushState({}, "", "/orders/order-1");
    let orderRequests = 0;

    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url.startsWith("/api/v1/orders/order-1/history")) {
        return json(historyListResponse([]));
      }
      if (url === "/api/v1/orders/order-1") {
        orderRequests += 1;
        return json(orderDetails({ status: orderRequests === 1 ? "SENT_TO_LAB" : "PARTIAL" }));
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    await screen.findByRole("button", { name: "Odśwież status" });
    expect(screen.getByText("Wysłane do laboratorium")).toBeInTheDocument();
    expect(orderRequests).toBe(1);

    // Upływ czasu bez kliknięcia nie wywołuje żadnego dodatkowego pobrania —
    // odświeżenie jest wyłącznie manualne (bez setInterval/pollingu).
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(orderRequests).toBe(1);

    await userEvent.click(screen.getByRole("button", { name: "Odśwież status" }));

    expect(await screen.findByText("Wynik częściowy")).toBeInTheDocument();
    expect(orderRequests).toBe(2);
    // Przycisk wraca do stanu spoczynku, bez śladu ukrytego pollingu.
    expect(screen.getByRole("button", { name: "Odśwież status" })).toBeEnabled();
  });

  it("pokazuje komunikat błędu po nieudanym ręcznym odświeżeniu, zachowując stare dane zlecenia", async () => {
    window.history.pushState({}, "", "/orders/order-1");
    let orderRequests = 0;

    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url.startsWith("/api/v1/orders/order-1/history")) {
        return json(historyListResponse([]));
      }
      if (url === "/api/v1/orders/order-1") {
        orderRequests += 1;
        if (orderRequests === 2) {
          return jsonError(
            503,
            "ORDER_FETCH_ERROR",
            "Nie udało się odświeżyć statusu zlecenia.",
            "corr-refresh"
          );
        }
        return json(orderDetails({ status: "SENT_TO_LAB" }));
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    await screen.findByRole("button", { name: "Odśwież status" });
    expect(screen.getByText("Wysłane do laboratorium")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Odśwież status" }));

    expect(await screen.findByText("Nie udało się odświeżyć statusu zlecenia.")).toBeInTheDocument();
    // Nie ma pełnego ekranu błędu — reszta strony i dotychczasowy status
    // zlecenia pozostają widoczne.
    expect(screen.getByRole("heading", { name: "Zlecenie: Anna Nowak" })).toBeInTheDocument();
    expect(screen.getByText("Wysłane do laboratorium")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Nie udało się wczytać zlecenia" })
    ).not.toBeInTheDocument();
    expect(orderRequests).toBe(2);

    // Kolejny, tym razem udany refresh czyści komunikat błędu.
    await userEvent.click(screen.getByRole("button", { name: "Odśwież status" }));
    await waitFor(() => {
      expect(
        screen.queryByText("Nie udało się odświeżyć statusu zlecenia.")
      ).not.toBeInTheDocument();
    });
    expect(orderRequests).toBe(3);
  });

  it("nie pokazuje przycisku 'Odśwież status' dla zlecenia niewymagającego odświeżenia", async () => {
    window.history.pushState({}, "", "/orders/order-1");
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/orders/order-1") {
        return json(orderDetails({ status: "COMPLETED" }));
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Zlecenie: Anna Nowak" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Odśwież status" })).not.toBeInTheDocument();
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

  it("preselekcjonuje pacjenta z query param patientId, ale pozwala zmienić wybór", async () => {
    window.history.pushState({}, "", "/orders/new?patientId=patient-1");
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/patients/patient-1") {
        return json(orderDetails().patient);
      }
      if (url === "/api/v1/tests?pageSize=100") {
        return json(medicalTestsResponse);
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(
      await screen.findByRole("region", { name: "Wybrany pacjent" })
    ).toHaveTextContent("Nowak Anna");
    expect(
      screen.getByRole("button", { name: "Wróć do wyszukiwania" })
    ).toBeInTheDocument();
  });

  it("nie crashuje dla niepoprawnego patientId i startuje bez wybranego pacjenta", async () => {
    window.history.pushState({}, "", "/orders/new?patientId=nieznany");
    mockFetch(({ url }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/patients/nieznany") {
        return jsonError(404, "PATIENT_NOT_FOUND", "Nie znaleziono pacjenta.");
      }
      if (url === "/api/v1/tests?pageSize=100") {
        return json(medicalTestsResponse);
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Nowe zlecenie" })).toBeInTheDocument();
    expect(await screen.findByRole("combobox", { name: "Pacjent" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Wybrany pacjent" })).not.toBeInTheDocument();
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

  describe("ORDER_PRIORITY_MAPPING (kontrolowany defekt frontendowy)", () => {
    it("[sygnał nieaktywny] wysyła priorytet Pilne tak, jak wybrany", async () => {
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

      await selectAnna();
      await userEvent.selectOptions(screen.getByLabelText("Priorytet"), "URGENT");
      await userEvent.click(await screen.findByLabelText(/CRP/));
      await userEvent.click(screen.getByRole("button", { name: "Utwórz zlecenie" }));

      await waitFor(() => {
        expect(createdPayload).toMatchObject({ priority: "URGENT" });
      });
    });

    it("[sygnał aktywny] wysyła ROUTINE mimo wybranego Pilne, mimo że formularz był już otwarty przed przełączeniem sygnału", async () => {
      let catalogFlag = false;
      let createdPayload: unknown;
      renderNewOrder(({ url, init }) => {
        if (url === "/api/v1/tests?pageSize=100") {
          return json({ ...medicalTestsResponse, catalogFlag });
        }
        if (url === "/api/v1/orders" && init?.method === "POST") {
          createdPayload = JSON.parse(String(init.body));
          return json(orderDetails({ id: "order-2" }), 201);
        }
        if (url === "/api/v1/orders/order-2") {
          return json(orderDetails({ id: "order-2" }));
        }
        return undefined;
      });

      await selectAnna();
      await userEvent.selectOptions(screen.getByLabelText("Priorytet"), "URGENT");
      await userEvent.click(await screen.findByLabelText(/CRP/));

      // Symuluje prowadzącego przełączającego kontrolowany defekt w /admin,
      // podczas gdy uczestnik ma formularz już otwarty — bez odświeżenia
      // strony kolejne "Utwórz zlecenie" musi odczytać nowy stan sygnału.
      catalogFlag = true;

      await userEvent.click(screen.getByRole("button", { name: "Utwórz zlecenie" }));

      await waitFor(() => {
        expect(createdPayload).toMatchObject({ priority: "ROUTINE" });
      });
    });

    it("[sygnał aktywny] nie zmienia normalnego wyboru Rutynowe", async () => {
      let createdPayload: unknown;
      renderNewOrder(({ url, init }) => {
        if (url === "/api/v1/tests?pageSize=100") {
          return json({ ...medicalTestsResponse, catalogFlag: true });
        }
        if (url === "/api/v1/orders" && init?.method === "POST") {
          createdPayload = JSON.parse(String(init.body));
          return json(orderDetails({ id: "order-2" }), 201);
        }
        if (url === "/api/v1/orders/order-2") {
          return json(orderDetails({ id: "order-2" }));
        }
        return undefined;
      });

      await selectAnna();
      await userEvent.click(await screen.findByLabelText(/CRP/));
      await userEvent.click(screen.getByRole("button", { name: "Utwórz zlecenie" }));

      await waitFor(() => {
        expect(createdPayload).toMatchObject({ priority: "ROUTINE" });
      });
    });

    it("nie ujawnia nazwy defektu w interfejsie uczestnika", async () => {
      renderNewOrder(({ url }) => {
        if (url === "/api/v1/tests?pageSize=100") {
          return json({ ...medicalTestsResponse, catalogFlag: true });
        }
        return undefined;
      });

      await selectAnna();
      const pageText = document.body.textContent ?? "";
      expect(pageText).not.toContain("ORDER_PRIORITY_MAPPING");
      expect(pageText.toLowerCase()).not.toContain("controlled bug");
    });
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
    labSendRetryPending: false,
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

/** Zlecenie w statusie `SAMPLE_COLLECTED`, gotowe do wysyłki do laboratorium. */
function sendableOrderDetails(overrides: Partial<OrderDetailsResponse> = {}) {
  return orderDetails({
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
    ],
    ...overrides
  });
}

function historyListResponse(items: unknown[]) {
  return {
    items,
    meta: { page: 1, pageSize: 20, total: items.length, totalPages: 1 }
  };
}

function rateLimitHistoryItem() {
  return {
    id: "history-rate-limit-1",
    eventType: "LAB_RATE_LIMIT_RECEIVED",
    occurredAt: "2026-09-07T10:00:00.000Z",
    actorType: "LAB",
    actorUserId: null,
    actorDisplayName: null,
    correlationId: "corr-rate-limit-1",
    integrationEventId: null,
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
  };
}

function serverErrorRetryHistoryItem() {
  return {
    id: "history-server-error-1",
    eventType: "LAB_SEND_RETRY",
    occurredAt: "2026-09-07T10:00:00.000Z",
    actorType: "LAB",
    actorUserId: null,
    actorDisplayName: null,
    correlationId: "corr-server-error-1",
    integrationEventId: null,
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
  };
}

function sendTimeoutHistoryItem() {
  return {
    id: "history-send-timeout-1",
    eventType: "LAB_SEND_TIMEOUT_RECEIVED",
    occurredAt: "2026-09-07T10:00:00.000Z",
    actorType: "LAB",
    actorUserId: null,
    actorDisplayName: null,
    correlationId: "corr-send-timeout-1",
    integrationEventId: null,
    previousStatus: "SAMPLE_COLLECTED",
    newStatus: "SAMPLE_COLLECTED",
    details: {
      eventType: "LAB_SEND_TIMEOUT_RECEIVED",
      attemptNumber: 1,
      retryAfterSeconds: 15,
      nextRetryAt: "2026-09-07T10:00:15.000Z",
      previousStatus: "SAMPLE_COLLECTED",
      newStatus: "SAMPLE_COLLECTED"
    }
  };
}

function orderRejectedHistoryItem() {
  return {
    id: "history-rejected-1",
    eventType: "LAB_ORDER_REJECTED",
    occurredAt: "2026-09-07T10:00:00.000Z",
    actorType: "LAB",
    actorUserId: null,
    actorDisplayName: null,
    correlationId: "corr-rejected-2",
    integrationEventId: null,
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
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/**
 * Odpowiedź 429 laboratorium wraz z opcjonalnym nagłówkiem `Retry-After`,
 * dokładnie tak jak zwraca ją API przy scenariuszu ograniczenia przepustowości.
 */
function rateLimitError(retryAfterSeconds?: number) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(retryAfterSeconds);
  }

  return new Response(
    JSON.stringify({
      error: {
        code: "LAB_RATE_LIMITED",
        message:
          "Laboratorium chwilowo ograniczyło liczbę żądań. Wysyłka zostanie ponowiona automatycznie.",
        correlationId: "corr-rate-limit-1"
      }
    }),
    { status: 429, headers }
  );
}

function serverError(retryAfterSeconds?: number) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(retryAfterSeconds);
  }

  return new Response(
    JSON.stringify({
      error: {
        code: "LAB_SERVER_ERROR",
        message:
          "Laboratorium jest chwilowo niedostępne. Wysyłka zostanie ponowiona automatycznie.",
        correlationId: "corr-server-error-1"
      }
    }),
    { status: 503, headers }
  );
}

/**
 * Odpowiedź 504 laboratorium (`LAB_SEND_TIMEOUT`) wraz z opcjonalnym
 * `Retry-After`, dokładnie tak jak zwraca ją API dla scenariusza `TIMEOUT`.
 */
function timeoutError(retryAfterSeconds?: number) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(retryAfterSeconds);
  }

  return new Response(
    JSON.stringify({
      error: {
        code: "LAB_SEND_TIMEOUT",
        message: "Timeout wysyłki do laboratorium. Wysyłka zostanie ponowiona automatycznie.",
        correlationId: "corr-send-timeout-1"
      }
    }),
    { status: 504, headers }
  );
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
