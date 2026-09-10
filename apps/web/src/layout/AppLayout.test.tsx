import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@klinika/api-contracts";
import { AppLayout } from "./AppLayout";

const workshopUser: AuthenticatedUser = {
  id: "user-1",
  login: "tester01",
  displayName: "Uczestnik 01",
  role: "STAFF",
  workspace: {
    id: "workspace-1",
    name: "Klinika Warsztatowa 01",
    slug: "warsztat-01"
  }
};

describe("AppLayout — topbar", () => {
  afterEach(() => {
    cleanup();
  });

  it("pokazuje osobno nazwę placówki, displayName uczestnika i jego login", () => {
    render(
      <MemoryRouter>
        <AppLayout user={workshopUser} onLogout={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByText("Klinika Warsztatowa 01")).toBeInTheDocument();
    expect(screen.getByText("Uczestnik 01")).toBeInTheDocument();
    expect(screen.getByText("tester01")).toBeInTheDocument();
    expect(screen.getByText("Użytkownik")).toBeInTheDocument();

    // Placówka i uczestnik muszą być wizualnie i tekstowo różne — nie ten sam węzeł.
    expect(screen.getByText("Klinika Warsztatowa 01")).not.toBe(
      screen.getByText("Uczestnik 01")
    );
  });
});
