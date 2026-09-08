import { expect, type Page } from "@playwright/test";

/** Loguje się przez formularz UI (`/login`) i czeka na Panel główny. Nigdy nie loguje hasła. */
export async function loginAsStaff(page: Page, login: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Login").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj" }).click();
  await expect(page.getByRole("heading", { name: "Panel główny" })).toBeVisible();
}
