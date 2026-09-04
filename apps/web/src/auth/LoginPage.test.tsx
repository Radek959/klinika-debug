import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
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

    render(<LoginPage onAuthenticated={onAuthenticated} />);
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
});
