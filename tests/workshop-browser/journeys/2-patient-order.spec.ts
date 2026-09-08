import { expect, test } from "@playwright/test";
import { loginAsStaff } from "../support/staff-auth";
import { generateSyntheticAdultPesel, nextPeselSerial } from "../support/synthetic-data";
import { readWorkshopStaffPassword, WORKSHOP_E2E_CONFIRMED } from "../support/env";

test.describe("Journey 2 — pacjent → zlecenie", () => {
  test.skip(!WORKSHOP_E2E_CONFIRMED, "wymaga WORKSHOP_E2E_CONFIRM=RUN");

  test("create patient → details → edit → Utwórz zlecenie → patient preselected", async ({
    page
  }) => {
    await loginAsStaff(page, "tester01", readWorkshopStaffPassword());

    const pesel = generateSyntheticAdultPesel(nextPeselSerial());
    const lastName = `Warsztatowa${Date.now()}`;

    await page.getByRole("link", { name: "Pacjenci" }).click();
    await page.getByRole("link", { name: "Dodaj pacjenta" }).click();
    await expect(page.getByRole("heading", { name: "Dodaj pacjenta" })).toBeVisible();

    await page.getByLabel("Imię").fill("Janina");
    await page.getByLabel("Nazwisko").fill(lastName);
    await page.getByLabel("PESEL").fill(pesel);
    await page.getByLabel("Data urodzenia").fill("1990-01-15");
    await page.getByLabel("Telefon").fill("500600700");
    await page.getByRole("button", { name: "Utwórz pacjenta" }).click();

    await expect(page.getByRole("heading", { name: `Janina ${lastName}` })).toBeVisible();
    await expect(page.getByText("Pacjent został utworzony.")).toBeVisible();

    await page.getByRole("link", { name: "Edytuj dane" }).click();
    await expect(page.getByRole("heading", { name: "Edytuj pacjenta" })).toBeVisible();
    await page.getByLabel("Telefon").fill("500600701");
    await page.getByRole("button", { name: "Zapisz zmiany" }).click();
    await expect(page.getByText("Dane pacjenta zostały zapisane.")).toBeVisible();

    await page.getByRole("link", { name: "Utwórz zlecenie" }).click();
    await expect(page.getByRole("heading", { name: "Nowe zlecenie" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Wybrany pacjent" })).toContainText(lastName);
  });
});
