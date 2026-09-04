import type { LoginResponse, MeResponse } from "@klinika/api-contracts";

interface ApiErrorResponse {
  error?: {
    code?: string;
    message?: string;
    correlationId?: string;
  };
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly correlationId?: string
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

export async function logout(token: string) {
  await request<void>("/api/v1/auth/logout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
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
  } catch {
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
      payload.error?.correlationId
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
