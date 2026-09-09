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

    // Domyślna zakładka jest "Logi aplikacji" — Dokumentacja jest osobną
    // zakładką, więc trzeba ją najpierw aktywować.
    await expect(page.getByRole("heading", { name: "Logi aplikacji" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dokumentacja" })).toHaveCount(0);

    await page.getByRole("link", { name: "Dokumentacja" }).click();
    await expect(page).toHaveURL(/\/materials\?tab=documentation$/);
    await expect(page.getByRole("heading", { name: "Dokumentacja" })).toBeVisible();

    const docsCard = page
      .getByRole("heading", { name: "Dokumentacja produktowa" })
      .locator("xpath=ancestor::article");
    await docsCard.getByRole("link", { name: "Podgląd" }).click();
    await expect(page.getByRole("heading", { name: "Dokumentacja produktowa" })).toBeVisible();
    await expect(page.locator("pre.product-docs-preview")).not.toBeEmpty();

    // Breadcrumb "Materiały" wraca do zakładki, z której wyszedł uczestnik.
    await page.getByRole("link", { name: "Materiały" }).click();
    await expect(page).toHaveURL(/\/materials\?tab=documentation$/);
    const apiDocsCard = page
      .getByRole("heading", { name: "Dokumentacja API" })
      .locator("xpath=ancestor::article");
    await expect(apiDocsCard.getByRole("link", { name: "Otwórz OpenAPI" })).toHaveAttribute(
      "href",
      "/api/docs"
    );

    await page.getByRole("link", { name: "Logi aplikacji" }).click();
    await expect(page).toHaveURL(/\/materials\?tab=logs$/);

    const firstLogCard = page.locator("article.material-card").first();
    await firstLogCard.getByRole("link", { name: "Podgląd" }).click();
    await expect(page.locator("pre.log-viewer")).not.toBeEmpty();

    // Breadcrumb z podglądu logu wraca do zakładki "Logi aplikacji".
    await expect(page.getByRole("link", { name: "Materiały" })).toHaveAttribute(
      "href",
      "/materials?tab=logs"
    );

    const totalEntriesText = await page.getByText(/\d+ z \d+ wpisów/).textContent();
    const totalCount = Number(totalEntriesText?.match(/z (\d+) wpisów/)?.[1]);
    expect(Number.isInteger(totalCount) && totalCount > 0).toBe(true);

    // Wartość konkretnego, unikalnego correlationId z happy-path.log
    // (a nie samej nazwy pola "correlationId", która występuje w każdym
    // wpisie i niczego by nie odfiltrowała) — dowodzi, że filtr faktycznie
    // ogranicza wyświetlane dane, a nie tylko "coś znajduje".
    const searchInput = page.getByLabel("Szukaj w logu");
    await searchInput.fill("dafdc577-a25b-4566-aeb8-edba1660f0e7");

    const filteredEntriesText = await page.getByText(/\d+ z \d+ wpisów/).textContent();
    const filteredCount = Number(filteredEntriesText?.match(/^(\d+) z/)?.[1]);
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThan(totalCount);

    await page.getByRole("button", { name: "Kopiuj wynik" }).click();
    await expect(page.getByRole("button", { name: "Skopiowano" })).toBeVisible();

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.length).toBeGreaterThan(0);
    expect(copied).toContain("dafdc577-a25b-4566-aeb8-edba1660f0e7");
  });
});
