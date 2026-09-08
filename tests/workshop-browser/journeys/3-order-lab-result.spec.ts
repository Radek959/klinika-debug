import { expect, test } from "@playwright/test";
import { loginAsStaff } from "../support/staff-auth";
import { generateSyntheticAdultPesel, nextPeselSerial } from "../support/synthetic-data";
import { readWorkshopStaffPassword, WORKSHOP_E2E_CONFIRMED } from "../support/env";

test.describe("Journey 3 — zlecenie → próbki → laboratorium → wynik", () => {
  test.skip(!WORKSHOP_E2E_CONFIRMED, "wymaga WORKSHOP_E2E_CONFIRM=RUN");

  test("order → samples → send → progress indicator → wynik → COMPLETED (labDelay=5s)", async ({
    page
  }) => {
    await loginAsStaff(page, "tester01", readWorkshopStaffPassword());

    const pesel = generateSyntheticAdultPesel(nextPeselSerial());
    const lastName = `Laboratoryjna${Date.now()}`;

    await page.goto("/patients/new");
    await page.getByLabel("Imię").fill("Karolina");
    await page.getByLabel("Nazwisko").fill(lastName);
    await page.getByLabel("PESEL").fill(pesel);
    await page.getByLabel("Data urodzenia").fill("1990-01-15");
    await page.getByLabel("Telefon").fill("500600702");
    await page.getByRole("button", { name: "Utwórz pacjenta" }).click();
    await expect(page.getByRole("heading", { name: `Karolina ${lastName}` })).toBeVisible();

    await page.getByRole("link", { name: "Utwórz zlecenie" }).click();
    await expect(page.getByRole("heading", { name: "Nowe zlecenie" })).toBeVisible();

    const crpRow = page.locator(".order-test-row", { hasText: "CRP" });
    await crpRow.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Utwórz zlecenie" }).click();

    await expect(page.getByText("Zlecenie zostało utworzone.")).toBeVisible();

    // Stepper na starcie: Zlecenie zakończone, Próbki w trakcie.
    const stepper = page.getByRole("list", { name: "Postęp zlecenia" });
    await expect(stepper).toContainText("Próbki (w trakcie)");

    await page.getByLabel("Kod kreskowy").fill("SMP-E2E-0001");
    const collectedAt = new Date().toISOString().slice(0, 16);
    await page.getByLabel("Czas pobrania").fill(collectedAt);
    await page.getByRole("button", { name: "Zarejestruj próbkę" }).click();
    await expect(page.getByText("Próbka została zarejestrowana.")).toBeVisible();

    await expect(stepper).toContainText("Laboratorium (w trakcie)");

    await page.getByRole("button", { name: "Wyślij do laboratorium" }).click();
    await expect(page.getByText("Zlecenie zostało wysłane do laboratorium.")).toBeVisible();

    // labDelay=5s (Setup globalny) — wynik powinien nadejść w rozsądnym czasie
    // bez stałych sleepów: odpytujemy status, reloadując stronę.
    await expect
      .poll(
        async () => {
          await page.reload();
          return page.locator(".status-badge").first().textContent();
        },
        { timeout: 30000, intervals: [1000, 2000] }
      )
      .toBe("Zakończone");

    await expect(page.getByRole("heading", { name: "Wyniki" })).toBeVisible();
    await expect(stepper).toContainText("Wynik (zakończono)");
  });
});
