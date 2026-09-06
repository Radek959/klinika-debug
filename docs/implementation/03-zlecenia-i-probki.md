# Etap 3 — zlecenia i próbki

**Status etapu:** `IN_PROGRESS`
**Aktywny kierunek:** poprawa UX formularza nowego zlecenia oraz domknięcie historii operacji.

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

## Brakujące lub wymagające poprawy

| Element | Status | Uwagi |
|---|---|---|
| Przebudowa UX formularza nowego zlecenia | `PLANNED` | Najbliższy rekomendowany PR. |
| Wybór pacjenta przez wyszukiwanie zamiast ręcznego ID | `PLANNED` | UI nie powinien wymagać wpisywania technicznego `patientId`. |
| Poprawa wyboru badań | `PLANNED` | Potrzebny bardziej czytelny wybór z wymaganymi danymi dodatkowymi i podsumowaniem próbek. |
| Edycja zlecenia w `DRAFT` | `PLANNED` | Endpoint z dokumentacji produktowej nie jest widoczny w kontrolerze zleceń. |
| Historia operacji | `PLANNED` | Brak osobnego endpointu i widoku historii zlecenia. |

## Następny PR

**Przebudowa UX formularza nowego zlecenia**

Minimalny zakres:

- wyszukiwany wybór aktywnego pacjenta;
- brak ręcznego wprowadzania `patientId`;
- uporządkowany wybór badań;
- prezentacja wymaganych pól dodatkowych;
- podsumowanie wybranych badań i wymaganych próbek;
- dostępność klawiaturą i responsywność;
- testy frontendowe.

Nie rozszerzać tego PR-a o edycję `DRAFT`, historię operacji ani nowe scenariusze laboratorium.

## Dowody weryfikacji

Ostatnia ocena statusu w tym dokumencie opiera się na przeglądzie kodu z 2026-09-06. Statusy nie oznaczają `VERIFIED`, dopóki PR z daną zmianą nie przejdzie wymaganych testów, CI i review.
