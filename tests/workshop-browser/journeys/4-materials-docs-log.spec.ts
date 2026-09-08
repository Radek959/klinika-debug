import { expect, test } from "@playwright/test";
import { loginAsStaff } from "../support/staff-auth";
import { readWorkshopStaffPassword, WORKSHOP_E2E_CONFIRMED } from "../support/env";

test.describe("Journey 4 — Materiały: dokumentacja i log", () => {
  test.skip(!WORKSHOP_E2E_CONFIRMED, "wymaga WORKSHOP_E2E_CONFIRM=RUN");

  test("Materials → Product docs → OpenAPI link exists → Log → search → copy", async ({
    page,
    context
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await loginAsStaff(page, "tester01", readWorkshopStaffPassword());

    await page.getByRole("link", { name: "Materiały" }).click();
    await expect(page.getByRole("heading", { name: "Materiały warsztatowe" })).toBeVisible();

    const docsCard = page
      .getByRole("heading", { name: "Dokumentacja produktowa" })
      .locator("xpath=ancestor::article");
    await docsCard.getByRole("link", { name: "Podgląd" }).click();
    await expect(page.getByRole("heading", { name: "Dokumentacja produktowa" })).toBeVisible();
    await expect(page.locator("pre.product-docs-preview")).not.toBeEmpty();

    await page.getByRole("link", { name: "Materiały" }).click();
    const apiDocsCard = page
      .getByRole("heading", { name: "Dokumentacja API" })
      .locator("xpath=ancestor::article");
    await expect(apiDocsCard.getByRole("link", { name: "Otwórz OpenAPI" })).toHaveAttribute(
      "href",
      "/api/docs"
    );

    const firstLogCard = page.locator("article.material-card").first();
    await firstLogCard.getByRole("link", { name: "Podgląd" }).click();
    await expect(page.locator("pre.log-viewer")).not.toBeEmpty();

    const searchInput = page.getByLabel("Szukaj w logu");
    await searchInput.fill("correlationId");
    await expect(page.getByText(/\d+ z \d+ wpisów/)).toBeVisible();

    await page.getByRole("button", { name: "Kopiuj wynik" }).click();
    await expect(page.getByRole("button", { name: "Skopiowano" })).toBeVisible();

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.length).toBeGreaterThan(0);
    expect(copied).toContain("correlationId");
  });
});
