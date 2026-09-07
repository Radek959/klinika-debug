# Etap 3 — zlecenia i próbki

**Status etapu:** `IN_PROGRESS`
**Aktywny kierunek:** historia operacji zlecenia.

## Zaimplementowane na `main`

| Element | Status | Dowód |
|---|---|---|
| Fundament danych zleceń i próbek | `IMPLEMENTED` | `prisma/schema.prisma`, migracja `20260906100000_orders_foundation`, test migracji `scripts/test-orders-foundation-migration.cjs`. |
| Katalog badań | `IMPLEMENTED` | `apps/api/src/tests-catalog`, `packages/api-contracts/src/tests-catalog.ts`, testy `apps/api/test/tests-catalog.e2e-spec.ts`. |
| Tworzenie zlecenia | `IMPLEMENTED` | `POST /api/v1/orders`, `apps/api/test/orders-create.e2e-spec.ts`, reguły domenowe w `packages/domain/src/orders/order-creation.ts`. |
| Lista zleceń | `IMPLEMENTED` | `GET /api/v1/orders`, `apps/api/test/orders-read.e2e-spec.ts`, `apps/web/src/orders/OrderListPage.tsx`. |
| Szczegóły zlecenia | `IMPLEMENTED` | `GET /api/v1/orders/{orderId}`, `apps/web/src/orders/OrderDetailsPage.tsx`. |
| Rejestracja próbek | `IMPLEMENTED` | `POST /api/v1/orders/{orderId}/samples`, `apps/api/test/orders-samples.e2e-spec.ts`, `packages/domain/src/orders/sample-collection.ts`. |
| Podstawowy cykl statusów | `IMPLEMENTED` | `packages/domain/src/orders/order-status.ts`, `apps/api/src/orders/order-status-domain.spec.ts`. |
| Interfejs zleceń | `IMPLEMENTED` | `apps/web/src/orders/NewOrderPage.tsx`, `OrderListPage.tsx`, `OrderDetailsPage.tsx`, `OrdersUi.test.tsx`. |
| Przebudowa UX formularza nowego zlecenia | `IMPLEMENTED` | PR #18 zmergowany do `main` jako `4bada8a`; `apps/web/src/orders/NewOrderPage.tsx`, `OrderSummary.tsx`, `PatientPicker.tsx`, `TestCatalogSelector.tsx`, style w `apps/web/src/styles.css`, testy `apps/web/src/orders/OrdersUi.test.tsx` i `orderFormState.test.ts`. |
| Wybór pacjenta przez wyszukiwanie zamiast ręcznego ID | `IMPLEMENTED` | PR #18: `apps/web/src/orders/PatientPicker.tsx`; test `OrdersUi.test.tsx` sprawdza brak pola "Identyfikator pacjenta", zapytanie `GET /api/v1/patients?active=true&page=1&pageSize=10&search=...`, obsługę klawiatury, retry i ukrycie technicznego ID. |
| Poprawa wyboru badań | `IMPLEMENTED` | PR #18: `apps/web/src/orders/TestCatalogSelector.tsx`, `OrderSummary.tsx`, `orderFormState.ts`; testy pokrywają zaznaczanie badań, pola dodatkowe, zachowanie wartości `false`, mapowanie błędów API i podsumowanie wymaganych próbek. |
| Edycja zlecenia w `DRAFT` | `IMPLEMENTED` | PR `feat/orders-draft-edit`: kontrakt `UpdateOrderRequest`, `PATCH /api/v1/orders/{orderId}`, transakcyjna aktualizacja badań i próbek, trasa `/orders/:orderId/edit`, współdzielony `OrderForm`, testy `orders-update.e2e-spec.ts`, `order-draft-edit.spec.ts`, `OrdersUi.test.tsx` i `orderFormState.test.ts`. |

## Brakujące lub wymagające poprawy

| Element | Status | Uwagi |
|---|---|---|
| Historia operacji | `PLANNED` | Brak osobnego endpointu i widoku historii zlecenia. |

## Następny PR

**Historia operacji zlecenia**

Minimalny zakres:

- model lub zapis zdarzeń historii zgodny z architekturą;
- endpoint historii zlecenia z izolacją workspace'u;
- zdarzenia dla utworzenia, edycji, rejestracji próbek, wysyłki i wyników;
- widok historii na szczegółach zlecenia;
- testy API, domenowe i frontendowe.

Nie rozszerzać tego PR-a o powiadomienia, retry, eksport ani nowe scenariusze laboratorium.

## Dowody weryfikacji

Ostatnia ocena statusu w tym dokumencie opiera się na przeglądzie kodu z 2026-09-07 po merge PR #18 do `main`.

Dowody dla PR #18:

- merge commit `4bada8a` (`Merge pull request #18 from Radek959/feat/orders-new-ux`);
- implementacja: `apps/web/src/orders/NewOrderPage.tsx`, `PatientPicker.tsx`, `TestCatalogSelector.tsx`, `OrderSummary.tsx`, `orderFormState.ts`, `apps/web/src/styles.css`;
- testy: `apps/web/src/orders/OrdersUi.test.tsx` i `apps/web/src/orders/orderFormState.test.ts`;
- historia commitów PR #18 obejmuje m.in. `331eba8 feat(web): add searchable patient picker`, `e6966a9 feat(web): add order test catalog selector`, `a76f742 feat(web): add new order summary`, `8a4c305 feat(web): rebuild new order page UX`, `2f78ff9 test(web): cover new order UX` i poprawki dostępności `69a5cd1`, `9f02ea4`, `6cb64b4`.

Statusy PR #18 są ustawione na `IMPLEMENTED`, nie na `VERIFIED` ani `DEPLOYED`. W tej sesji nie sprawdzono CI, review ani działającego środowiska na Hostingerze, więc nie ma podstaw do podniesienia statusu wdrożenia.

Dowody dla PR `feat/orders-draft-edit`:

- kontrakt: `packages/api-contracts/src/orders.ts` (`UpdateOrderRequest`);
- backend: `apps/api/src/orders/orders.controller.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/dto/update-order.dto.ts`;
- domena: `packages/domain/src/orders/order-draft-edit.ts`;
- frontend: `apps/web/src/orders/EditOrderPage.tsx`, `OrderForm.tsx`, `NewOrderPage.tsx`, `OrderDetailsPage.tsx`, `orderFormState.ts`;
- testy dodane lub rozszerzone: `apps/api/test/orders-update.e2e-spec.ts`, `packages/domain/src/orders/order-draft-edit.spec.ts`, `apps/web/src/orders/OrdersUi.test.tsx`, `apps/web/src/orders/orderFormState.test.ts`;
- wykonane lokalnie: `npm run db:generate`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run check`, `git diff --check`, `npm audit --omit=dev`;
- `npm run test:integration` nie zostało wykonane pozytywnie, ponieważ środowisko nie miało ustawionego `TEST_DATABASE_URL`, a Docker nie był dostępny do uruchomienia `mysql-test`.

Status edycji `DRAFT` jest ustawiony na `IMPLEMENTED`, nie na `VERIFIED` ani `DEPLOYED`. W tej sesji nie ma dowodu pozytywnego CI, review ani sprawdzenia środowiska Hostingera.
