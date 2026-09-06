import type {
  CreateOrderRequest,
  CreatePatientRequest,
  LoginResponse,
  MeResponse,
  MedicalTestsListResponse,
  OrderDetailsResponse,
  OrderResponse,
  OrdersListResponse,
  PatientResponse,
  PatientsListResponse,
  RegisterSampleRequest,
  UpdatePatientRequest
} from "@klinika/api-contracts";

export interface ApiFieldError {
  field: string;
  code: string;
  message: string;
}

interface ApiErrorResponse {
  error?: {
    code?: string;
    message?: string;
    correlationId?: string;
    fieldErrors?: ApiFieldError[];
  };
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly correlationId?: string,
    readonly fieldErrors: ApiFieldError[] = []
  ) {
    super(message);
  }
}

export async function login(loginName: string, password: string) {
  return request<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ login: loginName, password })
  });
}

export async function getCurrentUser(token: string) {
  return request<MeResponse>("/api/v1/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export interface PatientsListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  active?: boolean;
  identifierType?: string;
  sort?: string;
  order?: string;
}

export async function listPatients(
  token: string,
  params: PatientsListParams,
  signal?: AbortSignal
) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  });

  return request<PatientsListResponse>(`/api/v1/patients?${search.toString()}`, {
    headers: authHeaders(token),
    signal
  });
}

export async function getPatient(
  token: string,
  patientId: string,
  signal?: AbortSignal
) {
  return request<PatientResponse>(`/api/v1/patients/${patientId}`, {
    headers: authHeaders(token),
    signal
  });
}

export async function createPatient(
  token: string,
  payload: CreatePatientRequest
) {
  return request<PatientResponse>("/api/v1/patients", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
}

export async function updatePatient(
  token: string,
  patientId: string,
  payload: UpdatePatientRequest
) {
  return request<PatientResponse>(`/api/v1/patients/${patientId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
}

export interface OrdersListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  priority?: string;
  sort?: string;
  order?: string;
}

export async function listOrders(
  token: string,
  params: OrdersListParams,
  signal?: AbortSignal
) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  });

  return request<OrdersListResponse>(`/api/v1/orders?${search.toString()}`, {
    headers: authHeaders(token),
    signal
  });
}

export async function getOrder(token: string, orderId: string, signal?: AbortSignal) {
  return request<OrderDetailsResponse>(`/api/v1/orders/${orderId}`, {
    headers: authHeaders(token),
    signal
  });
}

export async function createOrder(token: string, payload: CreateOrderRequest) {
  return request<OrderResponse>("/api/v1/orders", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
}

export async function registerSample(
  token: string,
  orderId: string,
  payload: RegisterSampleRequest
) {
  return request<OrderResponse>(`/api/v1/orders/${orderId}/samples`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
}

export async function sendOrderToLab(token: string, orderId: string) {
  return request<OrderResponse>(`/api/v1/orders/${orderId}/send`, {
    method: "POST",
    headers: authHeaders(token)
  });
}

export async function listMedicalTests(token: string, signal?: AbortSignal) {
  return request<MedicalTestsListResponse>("/api/v1/tests?pageSize=100", {
    headers: authHeaders(token),
    signal
  });
}

export async function logout(token: string) {
  await request<void>("/api/v1/auth/logout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`
  };
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers
    });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") {
      throw caught;
    }
    throw new ApiClientError(
      "Nie udało się połączyć z serwerem. Sprawdź połączenie i spróbuj ponownie.",
      0
    );
  }

  if (!response.ok) {
    const payload = (await safeJson(response)) as ApiErrorResponse;
    const message =
      payload.error?.message ?? "Nie udało się wykonać operacji.";
    throw new ApiClientError(
      message,
      response.status,
      payload.error?.code,
      payload.error?.correlationId,
      payload.error?.fieldErrors ?? []
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
