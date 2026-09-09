# Workshop MVP — Klinika Debug

## Cel

Klinika Debug jest środowiskiem do około 6-godzinnego warsztatu „Tester z AI”, a nie pełnym produktem SaaS. Zakres aplikacji ma wspierać konkretne ćwiczenia: pracę z dokumentacją, analizę wymagań, generowanie przypadków i danych testowych, risk-based testing, exploratory testing, raportowanie błędów, analizę API i logów oraz tworzenie prostych narzędzi z AI.

Priorytetem jest wartość dydaktyczna, stabilność i szybkie przygotowanie środowiska. Funkcja, która nie jest potrzebna w ćwiczeniu albo do prowadzenia warsztatu, nie należy do Workshop MVP.

Nadrzędnym kontraktem dydaktycznym jest [`docs/warsztat/przebieg-szkolenia.md`](../warsztat/przebieg-szkolenia.md). Ten dokument opisuje zakres implementacyjny wynikający z tego przebiegu.

## Co już wystarcza jako rdzeń warsztatu

Etapy 1–4 pozostają rdzeniem aplikacji i nie powinny być dalej rozbudowywane bez konkretnej potrzeby warsztatowej:

- logowanie i sesje STAFF;
- izolacja danych przez workspace;
- pacjenci i reguły walidacji;
- katalog badań;
- zlecenia, próbki i historia operacji;
- REST API i OpenAPI;
- symulator laboratorium;
- wyniki kompletne i częściowe;
- odrzucenie próbki i walidacji;
- rate limit, server error i timeout;
- correlationId, retry i TECHNICAL_ERROR.

## Izolacja uczestników

Domyślny model warsztatu:

**1 uczestnik = 1 workspace + 1 konto STAFF.**

Jeżeli uczestnicy pracują parami, dopuszczalne jest 1 workspace + 1 konto STAFF na parę.

Powód: dane biznesowe są izolowane po `workspaceId`. Dwa osobne konta w tym samym workspace nadal widziałyby i modyfikowały te same dane. Osobny workspace pozwala uczestnikowi swobodnie tworzyć pacjentów, zlecenia i próbki bez wpływania na innych.

Wymagania:

- przygotować prosty mechanizm utworzenia wymaganej liczby workspace'ów warsztatowych;
- każdy workspace ma co najmniej jedno aktywne konto STAFF;
- loginy są unikalne globalnie, np. `tester01`, `tester02`, ...;
- hasła są przeznaczone wyłącznie do środowiska warsztatowego i nie są sekretami produkcyjnymi;
- reset warsztatu przywraca dane wszystkich workspace'ów uczestników do znanego stanu;
- panel prowadzącego działa globalnie i nie jest kontem uczestnika.

### Status: `workshop-participant-workspaces` (zaimplementowane)

Provisioning i reset są zaimplementowane jako mechanizmy CLI. Panel `/admin`
(sekcja "Minimalny Trainer Panel" niżej) wywołuje tę samą funkcję resetu
bezpośrednio — nie ma drugiej, równoległej implementacji:

- `npm run workshop:seed -- --participants=15` — tworzy (albo aktualizuje)
  deterministyczne workspace'y `warsztat-01`…`warsztat-NN` (widoczna nazwa
  `Klinika Warsztatowa NN`), po jednym koncie `tester01`…`testerNN` (rola
  `STAFF`, aktywne) w każdym, oraz zasiewa w nich te same syntetyczne dane
  startowe co standardowy seed. Operacja jest idempotentna — ponowne
  uruchomienie dla tej samej liczby uczestników nie tworzy duplikatów.
  Domyślna liczba uczestników to 15.
- Hasło kont `testerNN` pochodzi ze zmiennej środowiskowej
  `WORKSHOP_STAFF_PASSWORD` (wymagana w produkcji, bezpieczna wartość
  domyślna wyłącznie lokalnie/testowo — analogicznie do `SEED_STAFF_PASSWORD`
  używanego przez standardowy seed).
- `WORKSHOP_RESET_CONFIRM=RESET npm run workshop:reset` — resetuje dane
  WYŁĄCZNIE workspace'ów, których `slug` pasuje do wzorca `warsztat-NN`
  (nigdy `deleteMany({})` bez warunku `workspaceId`, nigdy `klinika-pokazowa`
  ani inne workspace'y). Reset usuwa dane utworzone przez uczestnika
  (pacjentów, zlecenia, próbki, wyniki, historię, zadania integracji z
  laboratorium), przywraca deterministyczne dane początkowe, zachowuje sam
  workspace, konto `testerNN` i globalny katalog badań. Bez ustawienia
  `WORKSHOP_RESET_CONFIRM=RESET` polecenie zawsze się zatrzymuje — to
  celowy dodatkowy bezpiecznik przed przypadkowym uruchomieniem. Funkcja
  resetu wymaga też programistycznego potwierdzenia (`confirm: true`) na
  poziomie wywołania — panel `/admin` (`POST /admin/api/reset`) wywołuje ją
  bezpośrednio, bez kopiowania logiki i bez polegania na zmiennej
  środowiskowej CLI. Panel udostępnia też analogiczny reset WYŁĄCZNIE
  jednego workspace'u (`resetSingleWorkshopWorkspace(...)`,
  `POST /admin/api/workspaces/:slug/reset`) — patrz sekcja "Minimalny
  Trainer Panel" niżej.
- Decyzja o sesjach: reset unieważnia (`revokedAt`) wszystkie aktywne sesje
  kont z resetowanych workspace'ów. Uczestnik musi zalogować się ponownie po
  reset — to akceptowalny, przewidywalny efekt uboczny, pokryty testem.
- Izolacja danych między workspace'ami warsztatowymi korzysta z tego samego,
  istniejącego mechanizmu `workspaceId`, co reszta aplikacji — nie
  wprowadzono żadnego nowego, osobnego mechanizmu izolacji.
- Panel `/admin` (wybór scenariusza, wybór błędu, UI resetu) był w tym PR-ze
  jeszcze poza zakresem — powstał w `workshop-trainer-controls` i został
  rozbudowany w `workshop-trainer-controls-recovery` (patrz status niżej).

## Pozostały zakres Workshop MVP

### 1. Minimalny Trainer Panel

Ukryty panel `/admin` tylko dla prowadzącego.

Musi pozwalać na:

- wybór globalnego scenariusza laboratorium;
- wybór jednego kontrolowanego błędu albo trybu `CLEAN`;
- zapis konfiguracji;
- reset danych warsztatowych do znanego stanu.

Nie budujemy pełnego panelu administracyjnego. Monitoring aplikacji, dashboard stanu bazy, rozbudowany RBAC, historia audytowa i zaawansowany UX są poza Workshop MVP.

#### Status: `workshop-trainer-controls` (zaimplementowane)

- Panel `/admin` jest samodzielną stroną HTML (inline CSS/JS, bez zależności
  od `apps/web`), serwowaną przez `AdminViewController`
  (`apps/api/src/admin/admin-view.controller.ts`). Nie jest zarejestrowany w
  routingu SPA uczestnika i nie jest nigdzie linkowany — jest osiągalny
  wyłącznie dla kogoś, kto zna adres `/admin`.
- Globalna konfiguracja (`labScenario`, `controlledBug`, `labDelayMs`,
  `updatedAt`) jest jednym wierszem w tabeli `workshop_config`
  (migracja addytywna `prisma/migrations/20260908090000_workshop_config`) i
  jest odczytywana/zapisywana przez `WorkshopConfigService`
  (`apps/api/src/workshop-config/workshop-config.service.ts`), z prostym
  cache'em w procesie — aplikacja działa jako pojedynczy proces Node, więc nie
  jest potrzebna żadna dodatkowa warstwa (Redis, pub/sub itd.). Nowa instancja
  serwisu (np. po restarcie procesu) zawsze odczytuje bieżący stan z bazy.
  `labDelayMs` (czas generowania wyników po przyjęciu zlecenia przez
  laboratorium) jest ograniczony do zamkniętej listy presetów
  (`LAB_DELAY_PRESETS_MS` w `apps/api/src/workshop-config/lab-delay.ts`) i NIE
  zmienia harmonogramu automatycznych retry (nadal 15/30/60 s).
- `OrdersService.sendOrder` czyta scenariusz NOWEJ wysyłki z
  `WorkshopConfigService`, zamiast bezpośrednio z `LAB_SIMULATOR_SCENARIO`.
  Automatyczne ponowienie wysyłki (`executeSendRetry`) nadal używa wyłącznie
  scenariusza zapisanego w `LabSendRetryJob.scenario` w chwili utworzenia
  zadania — zmiana konfiguracji z panelu `/admin` NIE może zamienić już
  zaplanowanego ponowienia w inny scenariusz. `LAB_SIMULATOR_SCENARIO`
  pozostaje tylko jako wartość STARTOWA (bootstrap) dla świeżo zmigrowanej
  bazy, odczytywana raz przy pierwszym utworzeniu wiersza `workshop_config`.
- Kontrolowany błąd: dozwolone wartości to `CLEAN` oraz trzy zaimplementowane
  defekty — `PATIENT_GUARDIAN`, `ORDER_FLOW`, `API_DIAGNOSTICS` (lista w
  `apps/api/src/workshop-config/controlled-bug.ts`, szczegóły implementacji w
  sekcji "Kontrolowane błędy" niżej). Aktywny może być co najwyżej jeden
  defekt naraz; backend odrzuca każdą wartość spoza tej listy (HTTP 400).
- Panel udostępnia DWA tryby resetu, oba przez istniejące funkcje w
  `apps/api/src/common/prisma/reset-workshop.ts` (bez drugiej, równoległej
  implementacji): „Resetuj środowisko” wywołuje `resetWorkshopWorkspaces(...)`
  — resetuje WSZYSTKIE workspace'y `warsztat-NN`, unieważnia sesje wszystkich
  uczestników i przywraca konfigurację do `SUCCESS` + `CLEAN` + `300000` ms;
  „Reset uczestnika” wywołuje `resetSingleWorkshopWorkspace(...)` — resetuje
  WYŁĄCZNIE jeden wskazany `warsztat-NN`, unieważnia sesję tylko tego
  uczestnika i NIE zmienia globalnej konfiguracji. Oba tryby wymagają jawnego
  potwierdzenia (natywny `window.confirm` w UI + pole `confirm: true` w
  kontrakcie API) i nigdy nie dotykają `klinika-pokazowa` ani innych
  workspace'ów spoza wzorca `warsztat-NN`.
- Uwierzytelnienie panelu jest CELOWO osobne od sesji `STAFF`
  (`apps/api/src/admin/admin-session.service.ts`,
  `apps/api/src/admin/admin-auth.guard.ts`): hasło porównywane jest przez
  `argon2` z hashem w `ADMIN_PASSWORD_HASH`, a sesja to bezstanowy,
  podpisany token (`HMAC-SHA256` z `ADMIN_SESSION_SECRET`) w ciasteczku
  `HttpOnly`, `SameSite=Strict`, `Secure` w produkcji, z TTL 2 godzin. Nie ma
  nowej tabeli kont admina, ról ani RBAC — jest tylko ważne/nieważne
  ciasteczko sesji prowadzącego.
- API panelu (`/admin/api/login`, `/admin/api/logout`, `/admin/api/config`,
  `/admin/api/reset`, `/admin/api/workspaces`,
  `/admin/api/workspaces/:slug/reset`) jest wyłączone z prefiksu `/api/v1`
  (`app.setGlobalPrefix` w `apps/api/src/app.setup.ts`) i z publicznego
  OpenAPI (`@ApiExcludeController()`), więc nie pojawia się w dokumentacji
  API dla uczestnika ani w API produktu/uprawnieniach `STAFF`.
  `GET /admin/api/workspaces` zwraca WYŁĄCZNIE `slug`/`name`/login
  workspace'ów `warsztat-NN`, bez danych pacjentów, haszy czy sesji — służy
  do wyboru uczestnika w sekcji "Reset uczestnika".
- Panel (`workshop-trainer-controls-recovery`) zawiera dodatkowo: badge
  podsumowujący aktualną konfigurację (scenariusz/defekt/czas wyników),
  maksymalnie 4 szybkie presety zapisujące `labScenario`+`controlledBug`+
  `labDelayMs` jednym kliknięciem przez istniejący `PUT /admin/api/config`
  (bez osobnego backendu presetów) oraz dynamiczne opisy pod selectami
  scenariusza laboratorium i kontrolowanego błędu — szczegóły w
  `docs/implementation/README.md` ("Workshop MVP — trainer controls").
- Testy: `apps/api/src/workshop-config/workshop-config.service.spec.ts`
  (bootstrap, cache w procesie, przeżycie restartu, walidacja, reset do
  domyślnych wartości), `apps/api/src/admin/admin-session.service.spec.ts`
  (wydawanie/weryfikacja/wygasanie/fałszowanie tokenu sesji),
  `apps/api/src/config/env.validation.spec.ts` (wymagane
  `ADMIN_PASSWORD_HASH`/`ADMIN_SESSION_SECRET`),
  `apps/api/test/admin.e2e-spec.ts` (uwierzytelnienie, zapis konfiguracji,
  wpływ na nową wysyłkę vs. zapisany scenariusz ponowienia, pełny reset,
  reset jednego uczestnika i izolacja pozostałych workspace'ów, lista
  `GET /admin/api/workspaces`, izolacja `klinika-pokazowa`, brak wycieku
  konfiguracji do API uczestnika i do OpenAPI),
  `apps/api/src/common/prisma/reset-workshop.spec.ts` i
  `apps/api/src/admin/admin.controller.spec.ts` (błąd DB/transakcji przy
  resecie uczestnika propaguje jako normalny błąd serwera — NIE jest
  maskowany jako 404; 404 dotyczy wyłącznie faktycznie nieistniejącego,
  poprawnego sluga `warsztat-NN`), `scripts/test-workshop-config-migration.cjs`
  (`npm run test:migration:workshop-config`, uruchamiany w
  `.github/workflows/ci.yml`).

### 2. Kontrolowane błędy

Zamiast ogólnego frameworka pakietów błędów implementujemy 2–3 deterministyczne defekty potrzebne w ćwiczeniach.

Rekomendowane kategorie:

- `PATIENT_GUARDIAN` — błąd związany z walidacją pacjenta niepełnoletniego/opiekuna;
- `ORDER_FLOW` — błąd w procesie zlecenia, próbek albo statusów;
- `API_DIAGNOSTICS` — zachowanie, które wymaga sprawdzenia DevTools/API/correlationId i może być użyte do raportu błędu.

Zasady:

- aktywny może być maksymalnie jeden defekt;
- `CLEAN` oznacza poprawne zachowanie;
- każdy defekt jest deterministyczny i opisany w wewnętrznych materiałach prowadzącego;
- testy muszą potwierdzać zarówno `CLEAN`, jak i aktywację defektu;
- nie tworzymy ogólnego frameworka rozszerzeń, jeśli proste jawne przełączniki wystarczają.

#### Status: `workshop-controlled-bugs` (zaimplementowane)

Wszystkie trzy defekty są aktywowane wyłącznie przez `controlledBug` w
globalnej konfiguracji panelu `/admin` (`WorkshopConfigService`, patrz sekcja
1. powyżej) — dozwolone wartości są zdefiniowane w jednym miejscu:
`apps/api/src/workshop-config/controlled-bug.ts`. Aktywny może być co
najwyżej jeden defekt naraz; `CLEAN` (domyślny) zawsze oznacza zachowanie
zgodne z dokumentacją produktową. Każde miejsce zmiany jest oznaczone
komentarzem `WORKSHOP CONTROLLED DEFECT`.

- `PATIENT_GUARDIAN` — wyłącza WYŁĄCZNIE regułę `GUARDIAN_REQUIRED` w
  `packages/domain/src/patients/patient-write.ts`
  (`PatientWriteValidationOptions.disableGuardianRequiredRule`). W trybie
  `CLEAN` pacjent niepełnoletni bez opiekuna jest nadal odrzucany. Reguła
  jest wołana z `apps/api/src/patients/patients.service.ts`
  (`create`/`update`), które odczytuje bieżący kontrolowany błąd z
  `WorkshopConfigService` przy każdym zapisie. Nie dotyka PESEL-u, daty
  urodzenia, płci, kontaktu pacjenta ani walidacji danych opiekuna, gdy
  opiekun JEST podany.
- `ORDER_FLOW` — dla zlecenia wymagającego 2+ różnych próbek, po
  zarejestrowaniu PIERWSZEJ z nich zlecenie błędnie przechodzi od razu do
  `SAMPLE_COLLECTED`, mimo że kolejna próbka jest nadal `REQUIRED`. Zmiana
  jest ograniczona do jednej decyzji przejścia statusu:
  `determineOrderStatusAfterSampleCollection` w
  `packages/domain/src/orders/sample-collection.ts`
  (`OrderStatusAfterSampleCollectionOptions.forceCollectedAfterFirstSample`),
  wołana z `apps/api/src/orders/orders.service.ts` (`registerSample`). Nie
  osłabia blokady wysyłki: zlecenie, dla którego naprawdę nie zarejestrowano
  jeszcze żadnej próbki, nadal nie może zostać wysłane (`canSendOrder`
  sprawdza wyłącznie faktyczny status zlecenia).
- `API_DIAGNOSTICS` — deterministyczny wyzwalacz: defekt aktywny ORAZ
  zlecenie gotowe do wysyłki ORAZ zlecenie zawiera badanie `TSH`. `POST
  /api/v1/orders/{orderId}/send` kończy się wtedy kontrolowanym HTTP 500
  (`apps/api/src/orders/orders.service.ts`, `sendOrder`) PRZED wywołaniem
  symulatora laboratorium — bez `externalOrderId`, bez zadania `lab_jobs`,
  bez zadania ponowienia i bez zarezerwowanego klucza idempotencji, więc
  zlecenie pozostaje możliwe do ponowienia po dezaktywacji defektu.
  Publiczna odpowiedź używa dokładnie tego samego, generycznego kształtu co
  każdy nieobsłużony błąd 500 (`ApiExceptionFilter`), więc nigdy nie
  ujawnia nazwy defektu, wewnętrznego przełącznika, sekretów ani stack
  trace'a. Tryb `CLEAN` zachowuje się identycznie jak normalna, działająca
  wysyłka dla tego samego zlecenia. Zgodnie z zakresem tego PR-a runtime'owe
  logowanie tego zdarzenia NIE zostało dodane — statyczne fixture'y logów
  powstaną w `workshop-log-fixtures`.
- Testy: `apps/api/src/patients/patient-write-domain.spec.ts` i
  `packages/domain/src/orders/sample-collection.spec.ts` (reguła CLEAN i
  aktywnego defektu na poziomie domeny), `apps/api/test/workshop-controlled-bugs.e2e-spec.ts`
  (integracja przez `/admin`: przełączanie `CLEAN → BUG → CLEAN` bez restartu
  aplikacji, brak wzajemnej aktywacji defektów, brak ujawnienia nazwy
  defektu w publicznej odpowiedzi, reset przywracający `CLEAN`, izolacja
  workspace'ów przy aktywnym defekcie, brak efektów ubocznych integracji dla
  `API_DIAGNOSTICS`).

### 3. Realistyczne syntetyczne logi warsztatowe

Nie budujemy pełnego subsystemu observability tylko po to, aby ćwiczyć analizę logów. Przygotowujemy kontrolowane fixture'y odzwierciedlające materiał z prawdziwego projektu.

Minimalny zestaw powinien obejmować różne rodzaje sytuacji, np.:

- `happy-path.log` — poprawny proces jako punkt odniesienia;
- `patient-error.log` — problem w obszarze pacjenta/walidacji;
- `order-flow.log` — problem procesu zlecenia;
- `lab-timeout.log` — timeout, kolejne retry i efekt końcowy;
- `api-diagnostics.log` — przypadek wymagający połączenia UI, API i logów;
- `correlation-trace.log` — kilka równoległych requestów, z których trzeba wyłuskać jeden proces;
- `production-like.log` — większy, zaszumiony materiał do bardziej zaawansowanej analizy.

Logi mają przypominać rzeczywiste logi aplikacyjne, a nie przygotowaną odpowiedź do ćwiczenia. Powinny zawierać w szczególności:

- znaczniki czasu w realistycznym zakresie;
- poziomy `DEBUG`, `INFO`, `WARN`, `ERROR`;
- nazwę komponentu lub serwisu;
- wiele równolegle występujących `correlationId`;
- requesty HTTP z metodą, ścieżką, statusem i czasem wykonania;
- zdarzenia związane z bazą, schedulerem i komunikacją z laboratorium;
- retry i numery prób;
- timeouty, `429`, `503`, `504` i sukcesy występujące w tym samym materiale;
- techniczny kontekst wyjątku bez danych wrażliwych;
- komunikaty niezwiązane z badanym incydentem;
- szum informacyjny oraz co najmniej jeden wiarygodny mylny trop;
- fragmenty, które same w sobie nie pozwalają potwierdzić root cause.

Scenariusz przeznaczony do analizy powinien mieć raczej **100+ wpisów**, a większy `production-like.log` może mieć kilkaset. Uczestnik ani AI nie powinien móc rozwiązać zadania przez wyszukanie pierwszej linii z `ERROR`.

Materiały powinny umożliwiać ćwiczenia takie jak:

- filtrowanie po `correlationId`;
- odtworzenie chronologii request → integracja → retry → wynik;
- oddzielenie faktów od hipotez;
- rozróżnienie symptomu od najbardziej prawdopodobnej przyczyny;
- odrzucenie niezwiązanych błędów i ostrzeżeń;
- wskazanie alternatywnych hipotez;
- wskazanie informacji, których brakuje do pewnego potwierdzenia root cause.

Fixture'y muszą być spójne z rzeczywistymi endpointami, statusami, kodami błędów, harmonogramem retry i `correlationId` Kliniki Debug. Wszystkie dane są syntetyczne, bez prawdziwych danych pacjentów, sekretów i tokenów.

#### Status: `workshop-log-fixtures` (zaimplementowane)

- Fixture'y JSONL (`workshop-assets/logs/`): `happy-path.log` (101 wpisów),
  `patient-error.log` (145), `order-flow.log` (138), `lab-timeout.log`
  (199), `api-diagnostics.log` (189), `correlation-trace.log` (220),
  `production-like.log` (601) — wszystkie powyżej wymaganego minimum, a
  `production-like.log` w widełkach 400-700. Plus `workshop-assets/logs/README.md`
  z opisem formatu, znaczenia pól, sposobu filtrowania po `correlationId` i
  informacją o w pełni syntetycznym charakterze danych — bez rozwiązań
  ćwiczeń, root cause, instrukcji dla prowadzącego ani listy aktywnych
  kontrolowanych błędów.
- Materiał jest generowany deterministycznie skryptem
  `scripts/generate-workshop-logs.cjs` (`npm run generate:workshop-logs`,
  PRNG `mulberry32` z ustalonym ziarnem — to samo ziarno zawsze daje
  identyczny wynik) na podstawie rzeczywistych endpointów (`/api/v1/...`,
  `/api/v1/integrations/lab/results`, `/health/live`, `/health/ready`),
  kodów błędów, statusów HTTP i harmonogramu retry 15/30/60 s
  (`LAB_SEND_RETRY_DELAYS_SECONDS`) Kliniki Debug — nie wymyślonego stosu
  technologicznego. Skrypt nie łączy się z żadną bazą, API ani usługą
  zewnętrzną. Współdzielone „kroki" narracji (logowanie, pacjent, zlecenie,
  próbka, wysyłka, akceptacja/callback laboratorium, ponowienie) są w
  `scripts/workshop-logs/narrative.cjs`, żeby scenariusze nie duplikowały
  logiki budowania wpisów.
- `order-flow.log` i `api-diagnostics.log` odzwierciedlają obserwowalne
  skutki defektów `ORDER_FLOW`/`API_DIAGNOSTICS` z `workshop-controlled-bugs`
  (niespójny status zlecenia po jednej z dwóch próbek; bardzo krótki, stały
  wzorzec HTTP 500 wyłącznie dla zleceń z badaniem `TSH`), ale — zgodnie z
  wymaganiem — NIGDZIE nie zawierają dosłownych nazw `PATIENT_GUARDIAN`,
  `ORDER_FLOW` ani `API_DIAGNOSTICS`; sprawdza to automatyczny walidator.
- Automatyczny walidator `scripts/validate-workshop-logs.cjs`
  (`npm run test:workshop-logs`) jest częścią zwykłego zestawu testów —
  wpięty do `npm test` w katalogu głównym, więc uruchamia się automatycznie
  w `npm run check` i w CI. Sprawdza: poprawność JSONL, minimalną liczbę
  wpisów na plik (i maksimum dla `production-like.log`), obecność wielu
  `correlationId` i wszystkich czterech poziomów logowania
  (`DEBUG`/`INFO`/`WARN`/`ERROR`), realistyczne, w przybliżeniu
  chronologiczne znaczniki czasu, wymagane kody statusu per scenariusz,
  obecność harmonogramu ponowień 15/30/60 s w `lab-timeout.log`, brak
  sekretów/haseł/znanych testowych numerów PESEL (i ogólnie wzorca pola
  `"pesel"`), brak nazw kontrolowanych błędów oraz brak znaczników w stylu
  `ROOT_CAUSE` — zarówno w plikach `.log`, jak i w `README.md`.
- Runtime'owe logowanie zdarzeń NIE zostało dodane do aplikacji — to
  świadomie statyczne fixture'y, a nie nowy podsystem observability, zgodnie
  z zakresem Workshop MVP.
- Uczestnik otrzymuje te fixture'y w aplikacji webowej (**Materiały**,
  `/materials`), a nie przez repozytorium/VS Code — patrz
  `docs/implementation/README.md`, wiersz „Workshop MVP — log browser (UI)”.

### 4. Workshop readiness

Ostatnim etapem developmentu jest sprawdzenie gotowości warsztatu, nie dodawanie kolejnych funkcji.

Minimalny smoke test:

1. logowanie uczestnika;
2. utworzenie/edycja pacjenta;
3. utworzenie zlecenia;
4. rejestracja próbki;
5. wysłanie do laboratorium;
6. co najmniej jeden scenariusz wyniku;
7. aktywacja kontrolowanego błędu;
8. sprawdzenie API/OpenAPI;
9. sprawdzenie fixture'ów logów;
10. reset danych i ponowne wykonanie głównej ścieżki.

Po pozytywnym smoke teście development Workshop MVP jest zakończony.

Realizacja: `npm run workshop:prepare` (przygotowanie środowiska bez resetu
danych, PR `workshop-production-prepare`), `npm run workshop:smoke`
(automatyczny smoke test wdrożonego środowiska pokrywający punkty 1-10
powyżej, PR `workshop-remote-smoke`) oraz techniczny runbook
`docs/warsztat/workshop-readiness.md` (audit zgodności ze szkoleniem,
checklisty przed szkoleniem, recovery, PR `workshop-final-readiness`).
Rzeczywiste uruchomienie smoke testu przeciwko wdrożonemu środowisku
Hostinger pozostaje krokiem do wykonania przez właściciela projektu — patrz
`docs/warsztat/workshop-readiness.md`, sekcja 7.

## Świadomie poza zakresem

Na potrzeby warsztatu nie implementujemy teraz:

- importu pacjentów z CSV;
- eksportu CSV/JSON;
- presetu `LARGE` i rozbudowanego generatora danych;
- pełnego modułu logowania/observability;
- osobnego widoku `/docs` w aplikacji;
- dashboardu monitoringu aplikacji i bazy;
- rozbudowanego audytu operacji admina;
- ogólnego frameworka pakietów błędów;
- pięciu pakietów `PATIENT_DATA`, `ORDER_FLOW`, `LAB_INTEGRATION`, `LOGS`, `PERFORMANCE`;
- gotowego rozszerzenia Chrome i skryptu Python w repozytorium.

Te elementy mogą wrócić później tylko wtedy, gdy pojawi się konkretne ćwiczenie lub potrzeba szkoleniowa, która bez nich nie może zostać zrealizowana.

## Kolejność kolejnych PR-ów

Rekomendowana sekwencja:

1. `workshop-participant-workspaces` — przygotowanie wielu workspace'ów i kont uczestników oraz bezpiecznego resetu;
2. `workshop-trainer-controls` — minimalny `/admin` z LAB scenario, bug selector i resetem;
3. `workshop-controlled-bugs` — 2–3 kontrolowane błędy;
4. `workshop-log-fixtures` — realistyczne syntetyczne logi i materiały do analizy;
5. `workshop-readiness` — smoke test, poprawki stabilności i finalizacja dokumentacji.

Każdy kolejny PR powstaje tylko wtedy, gdy wnosi wartość do konkretnego elementu warsztatu.

Faktyczna realizacja punktu 5 objęła trzy PR-y: `workshop-production-prepare`
(przygotowanie środowiska), `workshop-remote-smoke` (automatyczny smoke
runner) i `workshop-final-readiness` (audit, drobne poprawki, runbook,
zamknięcie planu).
