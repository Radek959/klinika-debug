# Plan implementacji Kliniki Debug

## Cel katalogu

Ten katalog opisuje realizację MVP: aktualny etap, zakres kolejnych PR-ów, statusy i dowody weryfikacji. Dokumentacja produktowa opisuje wymagania i oczekiwane zachowanie produktu, a katalog `docs/implementation` opisuje, co z tych wymagań zostało już zaimplementowane albo zaplanowane.

## Aktualny etap prac

Aktywny etap: **Etap 3 — zlecenia i próbki**, historia operacji zlecenia oraz brakujące elementy procesu.

Rekomendowany następny PR: **Historia operacji zlecenia**.

Zakres następnego PR-a powinien obejmować:

- endpoint historii zlecenia w bieżącym workspace;
- zapis zdarzeń biznesowych dla utworzenia, edycji, próbek, wysyłki i wyników;
- widok historii na szczegółach zlecenia;
- testy API, domenowe i frontendowe dla chronologii oraz izolacji workspace'u.

Nie implementować tego zakresu w PR-ach organizacyjnych.

## Status etapów

| Etap | Status | Stan na `main` |
|---|---|---|
| Etap 1 — fundament | `IMPLEMENTED` | Fundament aplikacji, deploymentu, sesji, workspace'ów, OpenAPI i testów jest obecny w kodzie. |
| Etap 2 — pacjenci | `IMPLEMENTED` | Podstawowa obsługa pacjentów w API i UI jest obecna w kodzie. |
| Etap 3 — zlecenia i próbki | `IN_PROGRESS` | Główny pion zleceń, katalogu badań, próbek, przebudowany UX nowego zlecenia i edycja `DRAFT` są zaimplementowane w PR; historia wymaga dalszej pracy. |
| Etap 4 — laboratorium | `IN_PROGRESS` | Wysyłka, idempotencja, trwała kolejka, scheduler, callback i sukces są zaimplementowane; pełne scenariusze i retry wymagają dalszej pracy. |
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

- struktura repozytorium i aktualny `main` po pobraniu z `origin/main`;
- merge PR #18 (`4bada8a`, `feat/orders-new-ux`) z przebudową UX formularza nowego zlecenia;
- PR `feat/orders-draft-edit` z endpointem `PATCH /api/v1/orders/{orderId}`, widokiem `/orders/{orderId}/edit`, współdzielonym formularzem zlecenia oraz testami domenowymi, API i UI;
- pliki z PR #18: `apps/web/src/orders/PatientPicker.tsx`, `TestCatalogSelector.tsx`, `OrderSummary.tsx`, `NewOrderPage.tsx`, `OrdersUi.test.tsx`, `orderFormState.ts`, `orderFormState.test.ts` i `apps/web/src/styles.css`;
- obecne kontrolery, serwisy, kontrakty, migracje i testy w `apps/`, `packages/` i `prisma/`;
- brak historii operacji zlecenia, modułów importu/eksportu, powiadomień, `/admin` i kontrolowanych pakietów błędów w kodzie;
- brak sprawdzenia działającego środowiska na Hostingerze w tej sesji, więc żaden zakres nie został podniesiony do `DEPLOYED`.
