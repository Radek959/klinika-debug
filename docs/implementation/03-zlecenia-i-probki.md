# Etap 3 — zlecenia i próbki

**Status etapu:** `IMPLEMENTED`
**Aktywny kierunek:** brak — zakres etapu jest zaimplementowany w kodzie. Aktywnym etapem jest [Etap 4 — laboratorium](04-laboratorium.md).

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
| Historia operacji zlecenia | `IMPLEMENTED` | PR `feat/order-history`: model `OrderHistory` w `prisma/schema.prisma`, migracja `20260907120000_order_history` z backfillem, `GET /api/v1/orders/{orderId}/history`, zapis zdarzeń w transakcjach `OrdersService` i `LabCallbacksService`, widok `apps/web/src/orders/OrderHistorySection.tsx`, testy `apps/api/test/orders-history.e2e-spec.ts`, `packages/domain/src/orders/order-history.spec.ts`, `apps/web/src/orders/OrderHistorySection.test.tsx`. |

## Brakujące lub wymagające poprawy

Brak elementów planu Etapu 3 pozostających do zaimplementowania. Kolejne prace nad zleceniami należą już do zakresu [Etapu 4 — laboratorium](04-laboratorium.md) (pełne scenariusze symulatora, retry, powiadomienia).

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

Dowody dla PR `feat/order-history`:

- model danych: `prisma/schema.prisma` (`OrderHistory`, `OrderHistoryEventType`, `OrderHistoryActorType`), migracja `prisma/migrations/20260907120000_order_history/migration.sql` z bezpiecznym backfillem `ORDER_CREATED` dla istniejących zleceń;
- kontrakty: `packages/api-contracts/src/order-history.ts`;
- domena: `packages/domain/src/orders/order-history.ts`, testy `packages/domain/src/orders/order-history.spec.ts`;
- backend: `apps/api/src/order-history/order-history.service.ts`, `order-history.mapper.ts`, `order-history.module.ts`, `dto/order-history-query.dto.ts`, `dto/order-history-response.dto.ts`; zapis zdarzeń wewnątrz istniejących transakcji w `apps/api/src/orders/orders.service.ts` (utworzenie, edycja `DRAFT`, rejestracja próbki, wysyłka, synchroniczne przyjęcie przez laboratorium) oraz `apps/api/src/lab-callbacks/lab-callbacks.service.ts` (odebranie wyniku); endpoint `GET /api/v1/orders/{orderId}/history` w `apps/api/src/orders/orders.controller.ts`;
- frontend: `apps/web/src/orders/OrderHistorySection.tsx`, integracja w `apps/web/src/orders/OrderDetailsPage.tsx`, etykiety w `apps/web/src/ui/labels.ts`, funkcja klienta `getOrderHistory` w `apps/web/src/api/client.ts`;
- testy dodane: `apps/api/test/orders-history.e2e-spec.ts` (izolacja workspace'u, atomowość, idempotencja wysyłki i callbacku, paginacja, stabilne sortowanie, wpis odtworzony migracją, publikacja w OpenAPI), `packages/domain/src/orders/order-history.spec.ts`, `apps/web/src/orders/OrderHistorySection.test.tsx`, `scripts/test-order-history-migration.cjs` (dodany do CI jako `npm run test:migration:order-history`);
- wykonane lokalnie z wynikiem pozytywnym: `npm run db:generate`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`, `npm audit --omit=dev`;
- `npm run test:migration:orders`, `npm run test:migration:order-history` i `npm run test:integration` **nie zostały wykonane**, ponieważ środowisko sesji nie miało dostępu do serwera MySQL ani do Dockera (ten sam znany brak środowiska co w sesji PR `feat/orders-draft-edit`). Poprawność migracji i testów integracyjnych zweryfikowano przeglądem kodu i porównaniem z istniejącymi wzorcami migracji/testów w repozytorium, ale nie ma na to dowodu z realnego uruchomienia — status pozostaje `IMPLEMENTED`, a CI musi potwierdzić te trzy komendy przed podniesieniem do `VERIFIED`.

Status historii operacji zlecenia jest ustawiony na `IMPLEMENTED`, nie na `VERIFIED` ani `DEPLOYED`.
