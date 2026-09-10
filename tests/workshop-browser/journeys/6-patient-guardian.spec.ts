import { expect, test } from "@playwright/test";
import { adminLogin, adminSetConfig } from "../support/admin-api";
import { loginAsStaff } from "../support/staff-auth";
import { generateSyntheticMinorPesel, nextPeselSerial } from "../support/synthetic-data";
import {
  readWorkshopAdminPassword,
  readWorkshopStaffPassword,
  WORKSHOP_E2E_CONFIRMED
} from "../support/env";

/**
 * Regresja dla PATIENT_GUARDIAN: kontrolowany defekt ma wyłączać wyłącznie
 * regułę "niepełnoletni pacjent musi mieć opiekuna", a nie psuć zapis przez
 * pusty formularz opiekuna. Frontend dla niepełnoletniego pacjenta pokazuje
 * (i wymusza) sekcję opiekuna, ale uczestnik nic w niej nie wpisuje —
 * dokładnie tak, jak zrobiłby to na warsztacie.
 */
test.describe("Journey 6 — PATIENT_GUARDIAN: małoletni bez opiekuna przez UI", () => {
  test.skip(!WORKSHOP_E2E_CONFIRMED, "wymaga WORKSHOP_E2E_CONFIRM=RUN");

  test("PATIENT_GUARDIAN aktywny → małoletni pacjent bez wypełnionych danych opiekuna → zapis przechodzi", async ({
    page,
    request
  }) => {
    const adminPassword = readWorkshopAdminPassword();

    await adminLogin(request, adminPassword);
    await adminSetConfig(request, {
      labScenario: "SUCCESS",
      controlledBug: "PATIENT_GUARDIAN",
      labDelayMs: 5000
    });

    try {
      await loginAsStaff(page, "tester01", readWorkshopStaffPassword());

      const pesel = generateSyntheticMinorPesel(nextPeselSerial());
      const lastName = `Maloletnia${Date.now()}`;

      await page.goto("/patients/new");
      await page.getByLabel("Imię").fill("Zosia");
      await page.getByLabel("Nazwisko").fill(lastName);
      await page.getByLabel("PESEL").fill(pesel);
      await page.getByLabel("Data urodzenia").fill("2018-01-15");
      await page.getByLabel("Telefon").fill("500600704");

      // Sekcja opiekuna jest wymuszona dla małoletniego (checkbox zaznaczony
      // i zablokowany), ale uczestnik CELOWO nie wypełnia żadnego pola
      // opiekuna — to jest dokładnie payload, który kiedyś psuł zapis mimo
      // aktywnego PATIENT_GUARDIAN.
      await expect(
        page.getByText("Pacjent jest niepełnoletni. Dane opiekuna są wymagane.")
      ).toBeVisible();
      await expect(page.getByLabel("Pacjent ma opiekuna")).toBeChecked();
      await expect(page.getByLabel("Pacjent ma opiekuna")).toBeDisabled();

      await page.getByRole("button", { name: "Utwórz pacjenta" }).click();

      await expect(page.getByRole("heading", { name: `Zosia ${lastName}` })).toBeVisible();
      await expect(page.getByText("Pacjent został utworzony.")).toBeVisible();

      // Uczestnik nie może dowiedzieć się z UI, że aktywny jest kontrolowany
      // defekt.
      const pageText = await page.locator("body").innerText();
      expect(pageText).not.toContain("PATIENT_GUARDIAN");
    } finally {
      await adminSetConfig(request, {
        labScenario: "SUCCESS",
        controlledBug: "CLEAN",
        labDelayMs: 5000
      });
    }
  });
});
