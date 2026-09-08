import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./CopyButton";

describe("CopyButton", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
  });

  afterEach(() => {
    cleanup();
  });

  it("kopiuje wartość do schowka i pokazuje 'Skopiowano' po sukcesie", async () => {
    render(<CopyButton value="corr-123" />);

    const button = screen.getByRole("button", { name: "Kopiuj" });
    await userEvent.click(button);

    expect(writeText).toHaveBeenCalledWith("corr-123");
    expect(await screen.findByRole("button", { name: "Skopiowano" })).toBeInTheDocument();
  });

  it("używa podanej etykiety zamiast domyślnej", () => {
    render(<CopyButton value="EXT-1" label="Kopiuj identyfikator" />);
    expect(screen.getByRole("button", { name: "Kopiuj identyfikator" })).toBeInTheDocument();
  });

  it("nie wywraca się, gdy schowek jest niedostępny", async () => {
    writeText.mockRejectedValueOnce(new Error("clipboard unavailable"));
    render(<CopyButton value="corr-123" />);

    await userEvent.click(screen.getByRole("button", { name: "Kopiuj" }));

    expect(screen.getByRole("button", { name: "Kopiuj" })).toBeInTheDocument();
  });
});
