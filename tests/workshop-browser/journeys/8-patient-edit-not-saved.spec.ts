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
 * PATIENT_EDIT_NOT_SAVED jest celowo prosty i oczywisty — uczestnik nie
 * potrzebuje DevTools ani znajomości API, żeby zauważyć problem. Ten test
 * potwierdza dokładnie to, co widzi uczestnik przez realny UI: komunikat
 * sukcesu, ale stary telefon nadal widoczny w szczegółach po zapisie. Nie
 * opiera się na przechwyceniu requestu — to pokrywa
 * `apps/api/test/workshop-controlled-bugs.e2e-spec.ts`.
 */
test.describe("Journey 8 — PATIENT_EDIT_NOT_SAVED: edycja telefonu przez UI", () => {
  test.skip(!WORKSHOP_E2E_CONFIRMED, "wymaga WORKSHOP_E2E_CONFIRM=RUN");

  test("PATIENT_EDIT_NOT_SAVED aktywny → zmiana telefonu → sukces, ale stary telefon nadal widoczny", async ({
    page,
    request
  }) => {
    const adminPassword = readWorkshopAdminPassword();

    await adminLogin(request, adminPassword);
    await adminSetConfig(request, {
      labScenario: "SUCCESS",
      controlledBug: "PATIENT_EDIT_NOT_SAVED",
      labDelayMs: 5000
    });

    try {
      await loginAsStaff(page, "tester01", readWorkshopStaffPassword());

      const pesel = generateSyntheticAdultPesel(nextPeselSerial());
      const lastName = `EdycjaTelefonu${Date.now()}`;
      const phoneBefore = "500600705";
      const phoneAfter = "600700800";

      await page.goto("/patients/new");
      await page.getByLabel("Imię").fill("Karolina");
      await page.getByLabel("Nazwisko").fill(lastName);
      await page.getByLabel("PESEL").fill(pesel);
      await page.getByLabel("Data urodzenia").fill("1990-01-15");
      await page.getByLabel("Telefon").fill(phoneBefore);
      await page.getByRole("button", { name: "Utwórz pacjenta" }).click();
      await expect(page.getByRole("heading", { name: `Karolina ${lastName}` })).toBeVisible();

      await page.getByRole("link", { name: "Edytuj dane" }).click();
      await expect(page.getByRole("heading", { name: "Edytuj pacjenta" })).toBeVisible();
      await expect(page.getByLabel("Telefon")).toHaveValue(phoneBefore);

      await page.getByLabel("Telefon").fill(phoneAfter);
      await page.getByRole("button", { name: "Zapisz zmiany" }).click();

      // UI zgłasza normalny sukces — bez żadnego ostrzeżenia ani nazwy
      // kontrolowanego defektu.
      await expect(page.getByText("Dane pacjenta zostały zapisane.")).toBeVisible();

      // Szczegóły pacjenta nadal pokazują POPRZEDNI numer telefonu, mimo
      // komunikatu sukcesu — to jest dokładnie objaw, który uczestnik ma
      // zgłosić.
      await expect(page.getByText(phoneBefore)).toBeVisible();
      await expect(page.getByText(phoneAfter)).not.toBeVisible();

      const pageText = await page.locator("body").innerText();
      expect(pageText).not.toContain("PATIENT_EDIT_NOT_SAVED");
      expect(pageText.toLowerCase()).not.toContain("controlled bug");
    } finally {
      await adminSetConfig(request, {
        labScenario: "SUCCESS",
        controlledBug: "CLEAN",
        labDelayMs: 5000
      });
    }
  });
});
