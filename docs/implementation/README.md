# Plan implementacji Kliniki Debug

## Cel katalogu

Ten katalog opisuje realizację MVP: aktualny etap, zakres kolejnych PR-ów, statusy i dowody weryfikacji. Dokumentacja produktowa opisuje wymagania i oczekiwane zachowanie produktu, a katalog `docs/implementation` opisuje, co z tych wymagań zostało już zaimplementowane albo zaplanowane.

## Aktualny etap prac

Aktywny etap: **Etap 4 — laboratorium**, pełne scenariusze symulatora i reguły retry.

Historia operacji zlecenia (Etap 3) jest zaimplementowana w PR `feat/order-history`.

Scenariusz `PARTIAL_SUCCESS` symulatora laboratorium jest zaimplementowany w PR `feat/lab-partial-success`.

Scenariusz `SAMPLE_REJECTED` symulatora laboratorium jest zaimplementowany w PR `feat/lab-sample-rejected`.

Scenariusz `VALIDATION_ERROR` symulatora laboratorium jest zaimplementowany w PR `feat/lab-validation-error`.

Scenariusz `RATE_LIMIT` symulatora laboratorium jest zaimplementowany w PR `feat/lab-rate-limit` razem z fundamentem trwałych ponowień wysyłki oraz poprawkami po review (brak gorącej pętli schedulera po błędzie zadania, weryfikacja aktualności zlecenia przed automatycznym ponowieniem wraz z transakcyjnym anulowaniem, odświeżanie historii w UI po 429 i 422).

Scenariusz `SERVER_ERROR` symulatora laboratorium jest implementowany w PR `feat/lab-server-error`: początkowy HTTP 503 (`LAB_SERVER_ERROR`) planuje automatyczne ponowienia 15/30/60 s, a po trzecim nieudanym retry zlecenie przechodzi z `SAMPLE_COLLECTED` do `TECHNICAL_ERROR`.

Rekomendowany następny PR: **Scenariusz `TIMEOUT` symulatora laboratorium** (kolejny brakujący zakres wskazany w [Etapie 4](04-laboratorium.md)).

Zakres następnego PR-a powinien obejmować timeout wysyłki albo callbacka bez implementowania powiadomień, panelu `/admin`, gotowych narzędzi warsztatowych ani promptów prowadzącego.

Nie implementować tego zakresu w PR-ach organizacyjnych.

## Granice narzędzi warsztatowych

Narzędzia warsztatowe nie są etapem implementacji aplikacji w tym repozytorium. Po zakończeniu aplikacji i weryfikacji wdrożenia powstaną osobne notatki prowadzącego w Notion na podstawie finalnej wersji produktu. Notatki będą zawierały ćwiczenia, wymagania, kryteria weryfikacji i prompty umieszczone bezpośrednio w poszczególnych blokach; nie powstanie osobna baza ćwiczeń.

Dokumentacja produktowa opisuje zachowanie aplikacji, a nie notatki prowadzącego. Repozytorium ma dostarczyć stabilne formularze, REST API, dane syntetyczne i `correlationId`, z których będzie można korzystać podczas ćwiczeń.

## Status etapów

| Etap | Status | Stan na `main` |
|---|---|---|
| Etap 1 — fundament | `IMPLEMENTED` | Fundament aplikacji, deploymentu, sesji, workspace'ów, OpenAPI i testów jest obecny w kodzie. |
| Etap 2 — pacjenci | `IMPLEMENTED` | Podstawowa obsługa pacjentów w API i UI jest obecna w kodzie. |
| Etap 3 — zlecenia i próbki | `IMPLEMENTED` | Główny pion zleceń, katalogu badań, próbek, przebudowany UX nowego zlecenia, edycja `DRAFT` i historia operacji zlecenia są zaimplementowane w kodzie. |
| Etap 4 — laboratorium | `IN_PROGRESS` | Wysyłka, idempotencja, trwała kolejka callbacków, scheduler, callback oraz scenariusze `SUCCESS`, `PARTIAL_SUCCESS`, `SAMPLE_REJECTED`, `VALIDATION_ERROR`, `RATE_LIMIT` i `SERVER_ERROR` są zaimplementowane; działa też trwałe ponawianie wysyłki 15/30/60 s z wyczerpaniem prób do `TECHNICAL_ERROR` dla kontrolowanego 5xx. Pozostały scenariusz `TIMEOUT` wymaga dalszej pracy. |
| Etap 5 — dane i obserwowalność | `PLANNED` | Import, eksport, logi aplikacyjne i dokumentacja publikowana z aplikacji nie są ukończone. |
| Etap 6 — admin i sterowanie | `PLANNED` | Panel `/admin`, reset i globalne sterowanie środowiskiem są zaplanowane. |
| Etap 7 — kontrolowane błędy | `PLANNED` | Mechanizm pakietów błędów i wewnętrzny katalog defektów są zaplanowane. |
| Etap 8 — narzędzia warsztatowe | `OUT_OF_SCOPE` | Gotowe rozszerzenie Chrome, skrypt Python i notatki prowadzącego nie są implementowane w tym repozytorium; powstaną poza repo po finalizacji aplikacji. |

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
| `OUT_OF_SCOPE` | Obszar świadomie wyłączony z implementacji w tym repozytorium |

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

Ostatni przegląd planu: 2026-09-07 (aktualizacja po PR `feat/lab-validation-error`).

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
- brak sprawdzenia działającego środowiska na Hostingerze w tej sesji, więc żaden zakres nie został podniesiony do `DEPLOYED`;
- PR `feat/lab-sample-rejected` ze scenariuszem `SAMPLE_REJECTED` symulatora laboratorium: rozszerzenie `LAB_SIMULATOR_SCENARIO` (`apps/api/src/lab-simulator/lab-simulator-scenario.ts`), deterministyczny wybór odrzucanej próbki i syntetyczne przyczyny (`packages/domain/src/orders/lab-sample-rejection.ts`), jedno zadanie `lab_jobs` z terminalnym callbackiem `REJECTED` (`apps/api/src/lab-simulator/lab-simulator.service.ts`, `apps/api/src/orders/orders.service.ts`), rozszerzony kontrakt webhooka o `rejectedSamples` (`packages/api-contracts/src/lab-results.ts`, `apps/api/src/lab-callbacks/dto/lab-results-webhook.dto.ts`), transakcyjna obsługa odrzucenia i zdarzenie historii `LAB_SAMPLE_REJECTED` (`apps/api/src/lab-callbacks/lab-callbacks.service.ts`, `packages/domain/src/orders/order-history.ts`), status badania `OrderTestStatus.REJECTED` w kontrakcie i odpowiedziach API, migracja `prisma/migrations/20260907190000_lab_sample_rejected` wraz z testem `scripts/test-lab-sample-rejected-migration.cjs`, prezentacja po polsku w `apps/web/src/orders/OrderDetailsPage.tsx`, `apps/web/src/orders/OrderHistorySection.tsx` i `apps/web/src/ui/labels.ts`;
- w sesji PR `feat/lab-sample-rejected` uruchomiono i potwierdzono powodzeniem: `npm ci`, `npm run db:generate`, `npm run lint`, `npm run typecheck`, `npm test` (71 testów `@klinika/api`, 65 `@klinika/web`, 87 `@klinika/domain`), `npm run build`, `git diff --check`, `npm audit --omit=dev`;
- brak dowodu pozytywnego uruchomienia `npm run test:integration` i `npm run test:migration:lab-sample-rejected` w sesji PR `feat/lab-sample-rejected`, ponieważ środowisko nie miało dostępu do MySQL ani do Dockera; te testy wymagają potwierdzenia w CI przed oznaczeniem scenariusza `SAMPLE_REJECTED` jako `VERIFIED`;
- poprawki review PR #22 na branchu `feat/lab-sample-rejected`: krok `npm run test:migration:lab-sample-rejected` dodany do `.github/workflows/ci.yml` (wcześniej skrypt istniał, ale CI go nie uruchamiało), sanityzacja publicznej historii zlecenia przez jawną whitelistę pól w `apps/api/src/order-history/order-history.mapper.ts` wraz z usunięciem `scenario` z `LabOrderAcceptedDetails` i `LabOrderAcceptedHistoryDetails`, walidacja spójności wyników, badań i odrzuconych materiałów przed transakcją w `apps/api/src/lab-callbacks/lab-callbacks.service.ts`, pełna lista `rejectedSamples` w szczegółach zdarzenia `LAB_SAMPLE_REJECTED` (`packages/domain/src/orders/order-history.ts`, `packages/api-contracts/src/order-history.ts`, `apps/web/src/orders/OrderHistorySection.tsx`) oraz uzupełnienie enumu i opisów OpenAPI w `apps/api/src/order-history/dto/order-history-response.dto.ts`; zmiany nie wymagały nowej migracji, ponieważ szczegóły historii są kolumną JSON;
- PR `feat/lab-validation-error` ze scenariuszem `VALIDATION_ERROR` symulatora laboratorium: rozszerzenie `LAB_SIMULATOR_SCENARIO` (`apps/api/src/lab-simulator/lab-simulator-scenario.ts`), deterministyczna i syntetyczna treść odrzucenia (`packages/domain/src/orders/lab-order-validation.ts`), przebudowa wyniku `LabSimulatorService.acceptOrder` na unię rozłączną `accepted: true | false` zamiast sterowania przepływem wyjątkami (`apps/api/src/lab-simulator/lab-simulator.service.ts`), synchroniczne HTTP 422 z istniejącego jednolitego formatu błędu API `LAB_ORDER_VALIDATION_ERROR` z `fieldErrors` i `correlationId` żądania (`apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders.controller.ts`), zapis wpisu historii `LAB_ORDER_REJECTED` w zatwierdzonej transakcji przed zgłoszeniem 422, brak klucza idempotencji, zadania `lab_jobs` i zmiany statusu zlecenia, nowe zdarzenie historii z jawną whitelistą pól także wewnątrz listy `fieldErrors` (`packages/domain/src/orders/order-history.ts`, `packages/api-contracts/src/order-history.ts`, `apps/api/src/order-history/order-history.mapper.ts`, `apps/api/src/order-history/dto/order-history-response.dto.ts`), migracja `prisma/migrations/20260907210000_lab_order_rejected` wraz z testem `scripts/test-lab-order-rejected-migration.cjs` uruchamianym w `.github/workflows/ci.yml`, prezentacja po polsku w `apps/web/src/orders/OrderDetailsPage.tsx`, `OrderHistorySection.tsx` i `apps/web/src/ui/labels.ts`;
- w sesji PR `feat/lab-validation-error` uruchomiono i potwierdzono powodzeniem: `npm ci`, `npm run db:generate`, `npm run lint`, `npm run typecheck`, `npm test` (84 testy `@klinika/api`, 69 `@klinika/web`, 103 `@klinika/domain`), `npm run build`, `npm audit --omit=dev` (0 podatności), `git diff --check`, `npm run test:production-start`;
- brak dowodu pozytywnego uruchomienia `npm run test:integration` i `npm run test:migration:lab-validation-error` w sesji PR `feat/lab-validation-error`, ponieważ środowisko nie miało dostępu do MySQL ani do Dockera (`ECONNREFUSED 127.0.0.1:3307`); z tego samego powodu `npm run build:hostinger` zatrzymał się na kroku `prisma migrate deploy` (`P1001`) po poprawnym `db:generate` i `build`; te kroki wymagają potwierdzenia w CI przed oznaczeniem scenariusza `VALIDATION_ERROR` jako `VERIFIED`.
- PR `feat/lab-rate-limit` ze scenariuszem `RATE_LIMIT` symulatora laboratorium: rozszerzenie `LAB_SIMULATOR_SCENARIO` (`apps/api/src/lab-simulator/lab-simulator-scenario.ts`), nowy wariant wyniku symulatora `LabSimulatorOrderRateLimited` z jawnym `attemptNumber` i utrwalonym `scenario` zamiast licznika w pamięci procesu (`apps/api/src/lab-simulator/lab-simulator.service.ts`), współdzielony harmonogram opóźnień 15/30/60 s (`packages/domain/src/orders/lab-send-retry.ts`), synchroniczne HTTP 429 (`LAB_RATE_LIMITED`) z nagłówkiem `Retry-After` dodanym jako typowane rozszerzenie istniejącego formatu błędów (`apps/api/src/common/errors/api-error.exception.ts`, `api-error.types.ts`, `api-exception.filter.ts`), dedykowany model trwałej kolejki `LabSendRetryJob` z migracją `prisma/migrations/20260907230000_lab_send_retry` i testem `scripts/test-lab-send-retry-migration.cjs` (`npm run test:migration:lab-rate-limit` w `.github/workflows/ci.yml`), scheduler z atomowym przejmowaniem zadań (`apps/api/src/lab-send-retry/`), atomowa rezerwacja klucza idempotencji wraz z jednym zadaniem ponowienia i jednym wpisem historii oraz transakcyjne domknięcie udanego ponowienia (`apps/api/src/orders/orders.service.ts`), nowe zdarzenia historii `LAB_RATE_LIMIT_RECEIVED` (`LAB`) i `LAB_SEND_RETRY` (`SYSTEM`) z whitelistą pól, prezentacja po polsku w `apps/web/src/orders/OrderDetailsPage.tsx`, `OrderHistorySection.tsx` i `apps/web/src/ui/labels.ts`;
- poprawki po review PR `feat/lab-rate-limit`: odsunięcie zadania w przyszłość po błędzie wykonania wraz ze stałym, bezpiecznym `lastError` (`apps/api/src/lab-send-retry/lab-send-retry.service.ts`, `packages/domain/src/orders/lab-send-retry.ts`), ponowna weryfikacja aktywności pacjenta i zgodności hasha przed automatycznym ponowieniem oraz transakcyjne, nieponawialne anulowanie zadania ze zwolnieniem rezerwacji idempotencji (`apps/api/src/orders/orders.service.ts`), wariant `outcome: "CANCELLED"` zdarzenia `LAB_SEND_RETRY` z kodem `reason` w domenie, kontraktach, mapperze i OpenAPI, odświeżanie sekcji historii po zapisanych odpowiedziach 429 i 422 (`apps/web/src/orders/OrderDetailsPage.tsx`, `OrderHistorySection.tsx`);
- w sesji PR `feat/lab-rate-limit` (również w sesji poprawek po review) nie było dostępu do MySQL ani Dockera (`ECONNREFUSED 127.0.0.1:3307`), więc `npm run test:integration` i `npm run test:migration:lab-rate-limit` nie zostały uruchomione lokalnie — ich wynik pochodzi z CI i wymaga potwierdzenia w logach przebiegu, zanim scenariusz `RATE_LIMIT` będzie mógł zostać podniesiony do `VERIFIED`.
