import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  MedicalTestsListResponse,
  OrderDetailsResponse,
  OrderListItem
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
      active: true
    },
    priority: "ROUTINE",
    status: "SAMPLE_COLLECTED",
    tests: [{ id: "order-test-1", medicalTestId: "test-crp", code: "CRP", name: "CRP", materialType: "SERUM", additionalData: null }],
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

const medicalTestsResponse: MedicalTestsListResponse = {
  items: [
    {
      id: "test-crp",
      code: "CRP",
      name: "CRP",
      description: "Białko C-reaktywne",
      materialType: "SERUM",
      estimatedDurationMinutes: 60,
      active: true,
      parameters: [{ code: "CRP", name: "CRP", valueType: "NUMERIC", unit: "mg/L", displayOrder: 1 }],
      requiredFields: []
    }
  ],
  page: 1,
  pageSize: 100,
  total: 1,
  totalPages: 1
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
    expect(screen.getByRole("link", { name: "Zlecenia" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: "Szczegóły" }));

    expect(
      await screen.findByRole("heading", { name: "Zlecenie: Anna Nowak" })
    ).toBeInTheDocument();
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
    expect(await screen.findByRole("button", { name: "Wyślij do laboratorium" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Wyślij do laboratorium" }));

    expect(
      await screen.findByText("Zlecenie zostało wysłane do laboratorium.")
    ).toBeInTheDocument();
    expect(await screen.findByText("EXT-123")).toBeInTheDocument();
  });

  it("tworzy nowe zlecenie z katalogu badań", async () => {
    window.history.pushState({}, "", "/orders/new");
    let createdPayload: unknown;

    mockFetch(({ url, init }) => {
      if (url === "/api/v1/auth/me") {
        return json({ user: authenticatedUser });
      }
      if (url === "/api/v1/tests?pageSize=100") {
        return json(medicalTestsResponse);
      }
      if (url === "/api/v1/orders" && init?.method === "POST") {
        createdPayload = JSON.parse(String(init.body));
        return json({ id: "order-2" }, 201);
      }
      if (url === "/api/v1/orders/order-2") {
        return json(orderDetails({ id: "order-2" }));
      }
      return jsonError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Nowe zlecenie" })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Identyfikator pacjenta"), "patient-1");
    await userEvent.click(await screen.findByLabelText(/CRP/));
    await userEvent.click(screen.getByRole("button", { name: "Utwórz zlecenie" }));

    await waitFor(() => {
      expect(createdPayload).toMatchObject({
        patientId: "patient-1",
        priority: "ROUTINE",
        tests: [{ medicalTestId: "test-crp" }]
      });
    });
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
