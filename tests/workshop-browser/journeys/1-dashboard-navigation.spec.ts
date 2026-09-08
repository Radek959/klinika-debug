import { expect, test } from "@playwright/test";
import { loginAsStaff } from "../support/staff-auth";
import { readWorkshopStaffPassword, WORKSHOP_E2E_CONFIRMED } from "../support/env";

test.describe("Journey 1 — dashboard i nawigacja", () => {
  test.skip(!WORKSHOP_E2E_CONFIRMED, "wymaga WORKSHOP_E2E_CONFIRM=RUN");

  test("login tester01 → dashboard → klik status → Orders z filtrem → Patients → Materials", async ({
    page
  }) => {
    await loginAsStaff(page, "tester01", readWorkshopStaffPassword());

    // Deep link ze statusu zlecenia na dashboardzie do przefiltrowanej listy.
    const completedStat = page.getByRole("link", { name: /Zakończone/ });
    await expect(completedStat).toBeVisible();
    await completedStat.click();
    await expect(page).toHaveURL(/\/orders\?status=COMPLETED/);
    await expect(page.getByRole("heading", { name: "Zlecenia" })).toBeVisible();
    await expect(page.getByLabel("Status")).toHaveValue("COMPLETED");

    await page.getByRole("link", { name: "Pacjenci" }).click();
    await expect(page.getByRole("heading", { name: "Pacjenci" })).toBeVisible();

    await page.getByRole("link", { name: "Materiały" }).click();
    await expect(page.getByRole("heading", { name: "Materiały warsztatowe" })).toBeVisible();
  });
});
