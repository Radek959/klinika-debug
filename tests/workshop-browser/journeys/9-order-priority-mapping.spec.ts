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
 * ORDER_PRIORITY_MAPPING ma zachęcać do investigation: UI → DevTools →
 * request/response → warstwa problemu → rozmowa z AI → raport błędu. Ten
 * test odtwarza dokładnie tę ścieżkę i jednocześnie udowadnia zachowanie
 * "bez F5" na realnym flow: uczestnik ma formularz nowego zlecenia JUŻ
 * otwarty (wybrany priorytet i badanie) w trybie CLEAN, PROWADZĄCY
 * przełącza defekt w /admin w tle, a uczestnik — bez odświeżenia ani
 * ponownego wejścia na stronę — klika "Utwórz zlecenie". Przechwycone
 * żądanie POST musi pokazać błędne mapowanie mimo że formularz istniał
 * zanim defekt został włączony.
 */
test.describe("Journey 9 — ORDER_PRIORITY_MAPPING: CITO wysyłane jako ROUTINE, bez F5", () => {
  test.skip(!WORKSHOP_E2E_CONFIRMED, "wymaga WORKSHOP_E2E_CONFIRM=RUN");

  test("formularz otwarty w CLEAN → defekt włączony w /admin w tle → submit bez F5 wysyła ROUTINE", async ({
    page,
    request
  }) => {
    const adminPassword = readWorkshopAdminPassword();

    await adminLogin(request, adminPassword);
    await adminSetConfig(request, {
      labScenario: "SUCCESS",
      controlledBug: "CLEAN",
      labDelayMs: 5000
    });

    try {
      await loginAsStaff(page, "tester01", readWorkshopStaffPassword());

      const pesel = generateSyntheticAdultPesel(nextPeselSerial());
      const lastName = `PriorytetZlecenia${Date.now()}`;

      await page.goto("/patients/new");
      await page.getByLabel("Imię").fill("Marta");
      await page.getByLabel("Nazwisko").fill(lastName);
      await page.getByLabel("PESEL").fill(pesel);
      await page.getByLabel("Data urodzenia").fill("1990-01-15");
      await page.getByLabel("Telefon").fill("500600706");
      await page.getByRole("button", { name: "Utwórz pacjenta" }).click();
      await expect(page.getByRole("heading", { name: `Marta ${lastName}` })).toBeVisible();

      // Formularz nowego zlecenia jest otwierany i wypełniany, gdy
      // środowisko jest jeszcze w trybie CLEAN.
      await page.getByRole("link", { name: "Utwórz zlecenie" }).click();
      await expect(page.getByRole("heading", { name: "Nowe zlecenie" })).toBeVisible();

      await page.getByLabel("Priorytet").selectOption("URGENT");
      const crpRow = page.locator(".order-test-row", { hasText: "CRP" });
      await crpRow.getByRole("checkbox").check();

      // Prowadzący przełącza kontrolowany defekt w /admin, podczas gdy
      // uczestnik nadal ma ten sam, już wypełniony formularz otwarty w
      // przeglądarce. Żadnej nawigacji ani odświeżenia strony poniżej.
      await adminSetConfig(request, {
        labScenario: "SUCCESS",
        controlledBug: "ORDER_PRIORITY_MAPPING",
        labDelayMs: 5000
      });

      const createOrderRequest = page.waitForRequest(
        (candidate) => candidate.url().includes("/api/v1/orders") && candidate.method() === "POST"
      );
      await page.getByRole("button", { name: "Utwórz zlecenie" }).click();
      const sentRequest = await createOrderRequest;

      // Network: uczestnik wybrał "Pilne" w UI (zanim defekt był aktywny),
      // ale przeglądarka wysłała ROUTINE — to jest dokładnie to, co
      // inspekcja DevTools ma pokazać, i dowód, że przełączenie defektu
      // zadziałało na kolejnym submicie bez F5.
      const sentBody = sentRequest.postDataJSON() as { priority: string };
      expect(sentBody.priority).toBe("ROUTINE");

      await expect(page.getByText("Zlecenie zostało utworzone.")).toBeVisible();
      await expect(page.getByText("Priorytet: Rutynowe")).toBeVisible();

      const pageText = await page.locator("body").innerText();
      expect(pageText).not.toContain("ORDER_PRIORITY_MAPPING");
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
