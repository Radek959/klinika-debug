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

## Brakujące lub wymagające poprawy

| Element | Status | Uwagi |
|---|---|---|
| `SAMPLE_REJECTED` | `PLANNED` | Brak pełnego scenariusza odrzucenia próbki przez symulator. |
| `VALIDATION_ERROR` | `PLANNED` | Brak globalnie sterowanego scenariusza odpowiedzi walidacyjnej symulatora. |
| `RATE_LIMIT` | `PLANNED` | Brak pełnego scenariusza `429` z regułami retry zgodnymi z dokumentacją. |
| `SERVER_ERROR` | `PLANNED` | Brak pełnego scenariusza `5xx` i wyczerpania prób. |
| `TIMEOUT` | `PLANNED` | Brak pełnego scenariusza timeoutu synchronicznego albo braku callbacka. |
| Pełne reguły retry | `PLANNED` | Scheduler ma retry zadania callbacka, ale reguły 15/30/60 sekund dla komunikacji lab nie są jeszcze domknięte jako produktowy mechanizm. |
| Powiadomienia | `PLANNED` | Brak modułu powiadomień i widoku `/notifications`. |

## Dowody weryfikacji

Ostatnia ocena statusu w tym dokumencie opiera się na przeglądzie kodu i testach lokalnych z 2026-09-07 (PR `feat/lab-partial-success`). Statusy nie oznaczają `VERIFIED`, dopóki PR z daną zmianą nie przejdzie wymaganych testów, CI i review.
