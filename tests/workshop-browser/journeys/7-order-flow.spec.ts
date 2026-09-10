import { expect, test } from "@playwright/test";
import { adminLogin, adminSetConfig } from "../support/admin-api";
import { loginAsStaff } from "../support/staff-auth";
import { generateSyntheticAdultPesel, nextPeselSerial } from "../support/synthetic-data";
import {
  readWorkshopAdminPassword,
  readWorkshopStaffPassword,
  WORKSHOP_E2E_CONFIRMED
} from "../support/env";

/**
 * Regresja dla ORDER_FLOW: zlecenie wymagające 2+ różnych materiałów błędnie
 * przechodzi do "Próbki pobrane" po zarejestrowaniu TYLKO pierwszej z nich —
 * druga próbka zostaje "Wymagana". Test dokumentuje to jako oczekiwane
 * zachowanie kontrolowanego defektu, nie jako regresję do naprawienia.
 */
test.describe("Journey 7 — ORDER_FLOW: błędne 'Próbki pobrane' po jednej z dwóch próbek", () => {
  test.skip(!WORKSHOP_E2E_CONFIRMED, "wymaga WORKSHOP_E2E_CONFIRM=RUN");

  test("ORDER_FLOW aktywny → rejestracja jednej z dwóch wymaganych próbek → 'Próbki pobrane', druga nadal 'Wymagana'", async ({
    page,
    request
  }) => {
    const adminPassword = readWorkshopAdminPassword();

    await adminLogin(request, adminPassword);
    await adminSetConfig(request, {
      labScenario: "SUCCESS",
      controlledBug: "ORDER_FLOW",
      labDelayMs: 5000
    });

    try {
      await loginAsStaff(page, "tester01", readWorkshopStaffPassword());

      const pesel = generateSyntheticAdultPesel(nextPeselSerial());
      const lastName = `Przeplywowa${Date.now()}`;

      await page.goto("/patients/new");
      await page.getByLabel("Imię").fill("Iwona");
      await page.getByLabel("Nazwisko").fill(lastName);
      await page.getByLabel("PESEL").fill(pesel);
      await page.getByLabel("Data urodzenia").fill("1990-01-15");
      await page.getByLabel("Telefon").fill("500600705");
      await page.getByRole("button", { name: "Utwórz pacjenta" }).click();
      await expect(page.getByRole("heading", { name: `Iwona ${lastName}` })).toBeVisible();

      await page.getByRole("link", { name: "Utwórz zlecenie" }).click();
      await expect(page.getByRole("heading", { name: "Nowe zlecenie" })).toBeVisible();

      // MORF (Krew EDTA) + CRP (Surowica) — dwa różne, wymagane materiały.
      await page.locator(".order-test-row", { hasText: "MORF" }).getByRole("checkbox").check();
      await page.locator(".order-test-row", { hasText: "CRP" }).getByRole("checkbox").check();
      await page.getByRole("button", { name: "Utwórz zlecenie" }).click();
      await expect(page.getByText("Zlecenie zostało utworzone.")).toBeVisible();

      // Rejestrujemy WYŁĄCZNIE próbkę surowicy (CRP) — krew EDTA (MORF)
      // zostaje celowo niezarejestrowana.
      const serumRow = page.locator("tr", { hasText: "Surowica" });
      await serumRow.getByLabel("Kod kreskowy").fill("SMP-OF-E2E-0001");
      const collectedAt = new Date().toISOString().slice(0, 16);
      await serumRow.getByLabel("Czas pobrania").fill(collectedAt);
      await serumRow.getByRole("button", { name: "Zarejestruj próbkę" }).click();
      await expect(page.getByText("Próbka została zarejestrowana.")).toBeVisible();

      // Kontrolowany defekt: zlecenie błędnie pokazuje "Próbki pobrane", mimo
      // że próbka krwi EDTA nadal jest "Wymagana".
      await expect(page.locator(".status-badge").first()).toHaveText("Próbki pobrane");
      const edtaRow = page.locator("tr", { hasText: "Krew (EDTA)" });
      await expect(edtaRow.locator(".status-badge")).toHaveText("Wymagana");

      const pageText = await page.locator("body").innerText();
      expect(pageText).not.toContain("ORDER_FLOW");
    } finally {
      await adminSetConfig(request, {
        labScenario: "SUCCESS",
        controlledBug: "CLEAN",
        labDelayMs: 5000
      });
    }
  });
});
