import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { AuthenticatedUser } from "@klinika/api-contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("wysyła dane logowania i zapisuje token sesji", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          token: "syntetyczny-token",
          expiresAt: "2026-09-04T13:00:00.000Z",
          user: {
            id: "user-1",
            login: "staff.demo",
            displayName: "Personel pokazowy",
            role: "STAFF",
            workspace: {
              id: "workspace-1",
              name: "Klinika Pokazowa",
              slug: "klinika-pokazowa"
            }
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );
    const onAuthenticated = vi.fn();

    renderLogin(onAuthenticated);
    await userEvent.type(screen.getByLabelText("Login"), "staff.demo");
    await userEvent.type(screen.getByLabelText("Hasło"), "HasloTestowe123!");
    await userEvent.click(screen.getByRole("button", { name: "Zaloguj" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(sessionStorage.getItem("klinika-debug-token")).toBe(
      "syntetyczny-token"
    );
    expect(onAuthenticated).toHaveBeenCalledWith(
      expect.objectContaining({ login: "staff.demo" })
    );
  });

  it("pokazuje polski komunikat przy błędzie sieciowym", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new TypeError("Failed to fetch")
    );

    renderLogin(vi.fn());
    await userEvent.type(screen.getByLabelText("Login"), "staff.demo");
    await userEvent.type(screen.getByLabelText("Hasło"), "HasloTestowe123!");
    await userEvent.click(screen.getByRole("button", { name: "Zaloguj" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nie udało się połączyć z serwerem."
    );
  });
});

function renderLogin(onAuthenticated: (user: AuthenticatedUser) => void) {
  render(
    <MemoryRouter>
      <LoginPage onAuthenticated={onAuthenticated} />
    </MemoryRouter>
  );
}
