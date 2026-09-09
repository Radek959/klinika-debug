import assert from "node:assert/strict";
import { test } from "node:test";
import { assertLocalWorkshopBrowserBaseUrl } from "./env";

/**
 * Testy WYŁĄCZNIE dla czystej logiki walidacji hosta (bez sieci, bez
 * Playwrighta) — reszta `env.ts` jest pokrywana przez rzeczywiste
 * uruchomienie `npm run test:workshop-browser`.
 */

test("akceptuje localhost", () => {
  assert.doesNotThrow(() => assertLocalWorkshopBrowserBaseUrl("http://localhost:3000"));
});

test("akceptuje 127.0.0.1", () => {
  assert.doesNotThrow(() => assertLocalWorkshopBrowserBaseUrl("http://127.0.0.1:3000"));
});

test("akceptuje IPv6 localhost [::1] (URL#hostname zwraca hosta w nawiasach)", () => {
  assert.doesNotThrow(() => assertLocalWorkshopBrowserBaseUrl("http://[::1]:3000"));
});

test("odrzuca publiczny host PRZED wykonaniem jakiegokolwiek requestu", () => {
  assert.throws(
    () => assertLocalWorkshopBrowserBaseUrl("https://klinikadebug.rwasik.pl"),
    /wyłącznie przeciwko lokalnemu środowisku/
  );
});

test("odrzuca inny publiczny host niż Hostinger", () => {
  assert.throws(
    () => assertLocalWorkshopBrowserBaseUrl("https://example.com"),
    /wyłącznie przeciwko lokalnemu środowisku/
  );
});

test("odrzuca niepoprawny URL czytelnym błędem", () => {
  assert.throws(
    () => assertLocalWorkshopBrowserBaseUrl("not-a-url"),
    /WORKSHOP_BROWSER_BASE_URL nie jest poprawnym URL-em/
  );
});
