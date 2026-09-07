# Plan implementacji Kliniki Debug

## Cel katalogu

Ten katalog opisuje realizację MVP: aktualny etap, zakres kolejnych PR-ów, statusy i dowody weryfikacji. Dokumentacja produktowa opisuje wymagania i oczekiwane zachowanie produktu, a katalog `docs/implementation` opisuje, co z tych wymagań zostało już zaimplementowane albo zaplanowane.

## Aktualny etap prac

Aktywny etap: **Etap 4 — laboratorium**, pełne scenariusze symulatora i reguły retry.

Historia operacji zlecenia (Etap 3) jest zaimplementowana w PR `feat/order-history`.

Scenariusz `PARTIAL_SUCCESS` symulatora laboratorium jest zaimplementowany w PR `feat/lab-partial-success`.

Rekomendowany następny PR: **Scenariusz `SAMPLE_REJECTED` symulatora laboratorium** (kolejny brakujący zakres wskazany w [Etapie 4](04-laboratorium.md)).

Zakres następnego PR-a powinien obejmować:

- pełny scenariusz odrzucenia jednej albo wszystkich próbek przez symulator;
- zgodność z domenowym statusem `REJECTED` już obecnym w kodzie;
- testy API i domenowe dla nowego scenariusza.

Nie implementować tego zakresu w PR-ach organizacyjnych.

## Status etapów

| Etap | Status | Stan na `main` |
|---|---|---|
| Etap 1 — fundament | `IMPLEMENTED` | Fundament aplikacji, deploymentu, sesji, workspace'ów, OpenAPI i testów jest obecny w kodzie. |
| Etap 2 — pacjenci | `IMPLEMENTED` | Podstawowa obsługa pacjentów w API i UI jest obecna w kodzie. |
| Etap 3 — zlecenia i próbki | `IMPLEMENTED` | Główny pion zleceń, katalogu badań, próbek, przebudowany UX nowego zlecenia, edycja `DRAFT` i historia operacji zlecenia są zaimplementowane w kodzie. |
| Etap 4 — laboratorium | `IN_PROGRESS` | Wysyłka, idempotencja, trwała kolejka, scheduler, callback, scenariusz `SUCCESS` i scenariusz `PARTIAL_SUCCESS` są zaimplementowane; pozostałe scenariusze i pełne reguły retry wymagają dalszej pracy. |
| Etap 5 — dane i obserwowalność | `PLANNED` | Import, eksport, logi aplikacyjne i dokumentacja publikowana z aplikacji nie są ukończone. |
| Etap 6 — admin i sterowanie | `PLANNED` | Panel `/admin`, reset i globalne sterowanie środowiskiem są zaplanowane. |
| Etap 7 — kontrolowane błędy | `PLANNED` | Mechanizm pakietów błędów i wewnętrzny katalog defektów są zaplanowane. |
| Etap 8 — narzędzia warsztatowe | `PLANNED` | Narzędzia pomocnicze dla warsztatu są zaplanowane poza głównym produktem. |

## Plany etapów

- [Etap 3 — zlecenia i próbki](03-zlecenia-i-probki.md)
- [Etap 4 — laboratorium](04-laboratorium.md)
- [Etap 5 — dane i obserwowalność](05-dane-i-obserwowalnosc.md)
- [Etap 6 — admin i sterowanie](06-admin-i-sterowanie.md)
- [Etap 7 — kontrolowane błędy](07-kontrolowane-bledy.md)
- [Etap 8 — narzędzia warsztatowe](08-narzedzia-warsztatowe.md)

Etapy 1 i 2 są opisane podsumowaniem w tym indeksie, ponieważ ich podstawowy zakres jest już obecny na `main`.

## Definicje statusów

| Status | Znaczenie |
|---|---|
| `PLANNED` | Zakres opisany, praca nierozpoczęta |
| `IN_PROGRESS` | Istnieje aktywna implementacja lub PR |
| `IMPLEMENTED` | Kod i testy znajdują się w PR |
| `VERIFIED` | Wymagane testy, CI i review zakończyły się powodzeniem |
| `DEPLOYED` | Zmiana została wdrożona i sprawdzona na Hostingerze |

## Zasady aktualizowania statusu

- Status aktualizuj w planie etapu razem z PR-em, który zmienia zakres funkcjonalny.
- `IMPLEMENTED` można ustawić po zakończeniu kodowania i uruchomieniu wymaganych testów lokalnych.
- `VERIFIED` można ustawić tylko na podstawie faktycznego wyniku testów, CI i review.
- `DEPLOYED` można ustawić tylko po sprawdzeniu działającego środowiska na Hostingerze.
- Dowody zapisuj w planie: wykonane komendy, odnośnik do CI, numer PR-a, datę review albo wynik smoke testu.
- Nie oznaczaj elementu jako gotowego tylko dlatego, że występuje w dokumentacji.

## Definition of Done

Element planu jest gotowy, gdy:

- zachowanie jest zgodne z dokumentacją produktową i specyfikacją MVP;
- zakres nie wychodzi poza aktywny etap bez wyraźnej decyzji;
- kod respektuje izolację workspace'u, bezpieczeństwo danych i polski interfejs;
- testy jednostkowe lub integracyjne pokrywają reguły biznesowe oraz kontrakty API adekwatnie do ryzyka;
- dokumentacja została zaktualizowana, jeśli zmieniło się zachowanie produktu;
- uruchomiono wymagane bramki jakości i zapisano dowody;
- PR zawiera jasny opis zakresu, zmian poza zakresem i wyniku weryfikacji.

## Dowody przeglądu aktualnego stanu

Ostatni przegląd planu: 2026-09-07.

Podstawa oceny:

- struktura repozytorium i aktualny `main` po pobraniu z `origin/main`, w tym merge PR #19 (`b8008d8`, `feat/orders-draft-edit`) z edycją zlecenia `DRAFT`;
- merge PR #18 (`4bada8a`, `feat/orders-new-ux`) z przebudową UX formularza nowego zlecenia;
- PR `feat/order-history` z modelem `OrderHistory`, migracją `20260907120000_order_history` z bezpiecznym backfillem `ORDER_CREATED`, endpointem `GET /api/v1/orders/{orderId}/history`, zapisem zdarzeń w transakcjach tworzenia, edycji, rejestracji próbki, wysyłki, synchronicznego przyjęcia przez laboratorium i callbacku wyników, oraz widokiem historii na `/orders/{orderId}`;
- pliki PR `feat/order-history`: `prisma/schema.prisma`, `prisma/migrations/20260907120000_order_history/migration.sql`, `packages/domain/src/orders/order-history.ts`, `packages/api-contracts/src/order-history.ts`, `apps/api/src/order-history/*`, zmiany w `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders.controller.ts`, `apps/api/src/lab-callbacks/lab-callbacks.service.ts`, `apps/web/src/orders/OrderHistorySection.tsx`, `apps/web/src/orders/OrderDetailsPage.tsx`, `apps/web/src/ui/labels.ts`;
- obecne kontrolery, serwisy, kontrakty, migracje i testy w `apps/`, `packages/` i `prisma/`;
- brak modułów importu/eksportu, powiadomień, `/admin` i kontrolowanych pakietów błędów w kodzie;
- PR `feat/lab-partial-success` ze scenariuszem `PARTIAL_SUCCESS` symulatora laboratorium: wybór scenariusza przez `LAB_SIMULATOR_SCENARIO` (`apps/api/src/lab-simulator/lab-simulator-scenario.ts`, walidowany startowo w `apps/api/src/config/env.validation.ts`), deterministyczny podział badań i planowanie dwóch callbacków (`packages/domain/src/orders/lab-results.ts`, `apps/api/src/lab-simulator/lab-simulator.service.ts`), zapis wielu zadań `lab_jobs` w tej samej transakcji wysyłki (`apps/api/src/orders/orders.service.ts`) bez migracji bazy (istniejący model `LabJob` już na to pozwalał), jawny fallback do `SUCCESS` dla zlecenia z jednym badaniem;
- w tej samej sesji uruchomiono i potwierdzono powodzeniem: `npm ci`, `npm run db:generate`, `npm run lint`, `npm run typecheck`, `npm test` (58 testów `@klinika/api`, 62 `@klinika/web`, 71 `@klinika/domain` — w tym nowe testy scenariusza `PARTIAL_SUCCESS`), `npm run build`, `git diff --check`, `npm audit --omit=dev` (0 podatności);
- brak dowodu pozytywnego uruchomienia `npm run test:integration` (nowe testy e2e scenariusza `PARTIAL_SUCCESS` w `apps/api/test/lab-results.e2e-spec.ts`), `npm run test:migration:orders` i `npm run test:migration:order-history` w tej sesji, ponieważ środowisko nie miało dostępu do MySQL ani do Dockera (ten sam znany brak co w sesji PR #19 i #20); te testy wymagają potwierdzenia w CI przed oznaczeniem elementu jako `VERIFIED`;
- brak sprawdzenia działającego środowiska na Hostingerze w tej sesji, więc żaden zakres nie został podniesiony do `DEPLOYED`.
