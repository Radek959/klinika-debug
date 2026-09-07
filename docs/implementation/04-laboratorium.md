# Etap 4 — laboratorium

**Status etapu:** `IN_PROGRESS`
**Aktywny kierunek:** domknięcie scenariuszy symulatora, pełnych reguł retry i powiadomień.

## Zaimplementowane na `main`

| Element | Status | Dowód |
|---|---|---|
| Wysyłka do laboratorium | `IMPLEMENTED` | `POST /api/v1/orders/{orderId}/send`, `apps/api/test/orders-send.e2e-spec.ts`. |
| Idempotencja wysyłki | `IMPLEMENTED` | Obsługa klucza w `apps/api/src/orders/orders.service.ts`, testy w `orders-send.e2e-spec.ts`. |
| Trwała kolejka w MySQL | `IMPLEMENTED` | Model `LabJob` w `prisma/schema.prisma`, migracja `20260906190000_lab_results_pipeline`. |
| Scheduler | `IMPLEMENTED` | `apps/api/src/lab-jobs/lab-jobs.scheduler.ts`. |
| Callback z wynikami | `IMPLEMENTED` | `POST /api/v1/integrations/lab/results`, `apps/api/src/lab-callbacks`, `apps/api/test/lab-results.e2e-spec.ts`. |
| Scenariusz `SUCCESS` | `IMPLEMENTED` | `apps/api/src/lab-simulator/lab-simulator.service.ts` generuje komplet wyników i zadanie `SUCCESS`. |
| Zapis i prezentacja wyników | `IMPLEMENTED` | `apps/api/src/lab-callbacks/lab-callbacks.service.ts`, `apps/web/src/orders/OrderDetailsPage.tsx`. |

## Zaimplementowane na `main` (kolejne PR-y)

| Element | Status | Dowód |
|---|---|---|
| `PARTIAL_SUCCESS` | `IMPLEMENTED` | Wybór scenariusza przez `LAB_SIMULATOR_SCENARIO` (domyślnie `SUCCESS`), deterministyczny podział badań w `apps/api/src/lab-simulator/lab-simulator.service.ts` i `packages/domain/src/orders/lab-results.ts` (`splitMedicalTestIdsForPartialSuccess`, `computePartialSuccessCallbackOffsets`), dwa zaplanowane zadania `lab_jobs` (`PARTIAL` → `COMPLETED`), jawny fallback do `SUCCESS` dla zlecenia z jednym badaniem. Testy: `packages/domain/src/orders/lab-results.spec.ts`, `apps/api/src/lab-simulator/lab-simulator-scenario.spec.ts`, `apps/api/src/lab-simulator/lab-simulator.service.spec.ts`, `apps/api/src/config/env.validation.spec.ts`, `apps/api/test/lab-results.e2e-spec.ts`. |
| `SAMPLE_REJECTED` | `IMPLEMENTED` | Wartość `SAMPLE_REJECTED` w `LAB_SIMULATOR_SCENARIO`, deterministyczny wybór jednej odrzucanej próbki i syntetycznych przyczyn w `packages/domain/src/orders/lab-sample-rejection.ts` (`selectSampleToReject`, `planSampleRejection`, `SAMPLE_REJECTION_REASONS`), jedno zadanie `lab_jobs` z terminalnym callbackiem `REJECTED` (`apps/api/src/lab-simulator/lab-simulator.service.ts`), rozszerzony kontrakt webhooka o `rejectedSamples` (`packages/api-contracts/src/lab-results.ts`, `apps/api/src/lab-callbacks/dto/lab-results-webhook.dto.ts`), transakcyjna obsługa w `apps/api/src/lab-callbacks/lab-callbacks.service.ts` z walidacją spójności wyników, badań i odrzuconych materiałów wykonywaną przed transakcją (`LAB_CALLBACK_VALIDATION_ERROR`, HTTP 400, zero zmian w bazie), nowe zdarzenie historii `LAB_SAMPLE_REJECTED` z pełną listą `rejectedSamples`, statusy badań `OrderTestStatus.REJECTED` i migracja `20260907190000_lab_sample_rejected`, sanityzacja publicznej historii przez jawną whitelistę pól w `apps/api/src/order-history/order-history.mapper.ts` (m.in. `LAB_ORDER_ACCEPTED` nie zwraca nazwy scenariusza symulatora), prezentacja po polsku w `apps/web/src/orders/OrderDetailsPage.tsx` i `OrderHistorySection.tsx`. Testy: `packages/domain/src/orders/lab-sample-rejection.spec.ts`, `packages/domain/src/orders/order-history.spec.ts`, `packages/domain/src/orders/lab-results.spec.ts`, `apps/api/src/lab-simulator/*.spec.ts`, `apps/api/src/config/env.validation.spec.ts`, `apps/api/test/lab-results.e2e-spec.ts`, `apps/api/test/orders-history.e2e-spec.ts`, `apps/web/src/orders/OrdersUi.test.tsx`, `apps/web/src/orders/OrderHistorySection.test.tsx`, `scripts/test-lab-sample-rejected-migration.cjs` (uruchamiany w `.github/workflows/ci.yml`). |

## Brakujące lub wymagające poprawy

| Element | Status | Uwagi |
|---|---|---|
| `VALIDATION_ERROR` | `PLANNED` | Brak globalnie sterowanego scenariusza odpowiedzi walidacyjnej symulatora. Rekomendowany zakres kolejnego PR-a. |
| `RATE_LIMIT` | `PLANNED` | Brak pełnego scenariusza `429` z regułami retry zgodnymi z dokumentacją. |
| `SERVER_ERROR` | `PLANNED` | Brak pełnego scenariusza `5xx` i wyczerpania prób. |
| `TIMEOUT` | `PLANNED` | Brak pełnego scenariusza timeoutu synchronicznego albo braku callbacka. |
| Pełne reguły retry | `PLANNED` | Scheduler ma retry zadania callbacka, ale reguły 15/30/60 sekund dla komunikacji lab nie są jeszcze domknięte jako produktowy mechanizm. |
| Powiadomienia | `PLANNED` | Brak modułu powiadomień i widoku `/notifications`. |

## Dowody weryfikacji

Ostatnia ocena statusu w tym dokumencie opiera się na przeglądzie kodu i testach lokalnych z 2026-09-07 (PR `feat/lab-sample-rejected`, wcześniej `feat/lab-partial-success`). Statusy nie oznaczają `VERIFIED`, dopóki PR z daną zmianą nie przejdzie wymaganych testów, CI i review.

Scenariusz `SAMPLE_REJECTED` jest oznaczony jako `IMPLEMENTED` na podstawie kodu oraz lokalnie uruchomionych `npm run lint`, `npm run typecheck`, `npm test` i `npm run build`. Testy e2e (`npm run test:integration`) i test migracji (`npm run test:migration:lab-sample-rejected`) wymagają MySQL i muszą zostać potwierdzone w CI.

Test migracji `npm run test:migration:lab-sample-rejected` jest od tego PR-a uruchamiany w `.github/workflows/ci.yml` razem z pozostałymi testami migracji, przed `npm run db:migrate:test`. Do czasu zielonego przebiegu CI dla PR #22 wynik tego kroku pozostaje niepotwierdzony i scenariusz nie może zostać podniesiony do `VERIFIED`.
