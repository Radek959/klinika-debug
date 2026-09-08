import { expect, test } from "@playwright/test";
import { adminLogin, adminSetConfig } from "../support/admin-api";
import { loginAsStaff } from "../support/staff-auth";
import { generateSyntheticAdultPesel, nextPeselSerial } from "../support/synthetic-data";
import {
  readWorkshopAdminPassword,
  readWorkshopStaffPassword,
  WORKSHOP_E2E_CONFIRMED
} from "../support/env";

test.describe("Journey 5 — API_DIAGNOSTICS: investigation z correlationId", () => {
  test.skip(!WORKSHOP_E2E_CONFIRMED, "wymaga WORKSHOP_E2E_CONFIRM=RUN");

  test("API_DIAGNOSTICS → UI send → safe error → correlationId → copy → CLEAN", async ({
    page,
    context,
    request
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const adminPassword = readWorkshopAdminPassword();

    await adminLogin(request, adminPassword);
    await adminSetConfig(request, {
      labScenario: "SUCCESS",
      controlledBug: "API_DIAGNOSTICS",
      labDelayMs: 5000
    });

    try {
      await loginAsStaff(page, "tester01", readWorkshopStaffPassword());

      const pesel = generateSyntheticAdultPesel(nextPeselSerial());
      const lastName = `Diagnostyczna${Date.now()}`;

      await page.goto("/patients/new");
      await page.getByLabel("Imię").fill("Ewa");
      await page.getByLabel("Nazwisko").fill(lastName);
      await page.getByLabel("PESEL").fill(pesel);
      await page.getByLabel("Data urodzenia").fill("1990-01-15");
      await page.getByLabel("Telefon").fill("500600703");
      await page.getByRole("button", { name: "Utwórz pacjenta" }).click();
      await expect(page.getByRole("heading", { name: `Ewa ${lastName}` })).toBeVisible();

      await page.getByRole("link", { name: "Utwórz zlecenie" }).click();
      const tshRow = page.locator(".order-test-row", { hasText: "TSH" });
      await tshRow.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Utwórz zlecenie" }).click();
      await expect(page.getByText("Zlecenie zostało utworzone.")).toBeVisible();

      await page.getByLabel("Kod kreskowy").fill("SMP-E2E-0002");
      const collectedAt = new Date().toISOString().slice(0, 16);
      await page.getByLabel("Czas pobrania").fill(collectedAt);
      await page.getByRole("button", { name: "Zarejestruj próbkę" }).click();
      await expect(page.getByText("Próbka została zarejestrowana.")).toBeVisible();

      await page.getByRole("button", { name: "Wyślij do laboratorium" }).click();

      // Bezpieczny, generyczny komunikat — uczestnik NIE widzi nazwy
      // kontrolowanego defektu ani żadnego wewnętrznego przełącznika.
      await expect(page.getByText("Wystąpił nieoczekiwany błąd systemu.")).toBeVisible();
      const pageText = await page.locator("body").innerText();
      expect(pageText).not.toContain("API_DIAGNOSTICS");
      expect(pageText.toLowerCase()).not.toContain("controlled");

      const correlationIdText = await page.locator(".history-id").first().textContent();
      expect(correlationIdText?.trim().length).toBeGreaterThan(0);

      await page.getByRole("button", { name: "Kopiuj" }).click();
      await expect(page.getByRole("button", { name: "Skopiowano" })).toBeVisible();

      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied).toBe(correlationIdText?.trim());
    } finally {
      // Powrót do CLEAN, żeby pojedyncza próba tej ścieżki (nawet nieudana)
      // nie zostawiła aktywnego kontrolowanego defektu.
      await adminSetConfig(request, {
        labScenario: "SUCCESS",
        controlledBug: "CLEAN",
        labDelayMs: 5000
      });
    }
  });
});
