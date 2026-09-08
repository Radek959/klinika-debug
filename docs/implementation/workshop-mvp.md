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

Provisioning i reset są zaimplementowane jako mechanizmy CLI (fundament pod
przyszły endpoint `/admin`, nie jego zamiennik):

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
  poziomie wywołania, więc przyszły endpoint `/admin` będzie mógł ją wywołać
  bezpośrednio, bez kopiowania logiki i bez polegania na zmiennej
  środowiskowej CLI.
- Decyzja o sesjach: reset unieważnia (`revokedAt`) wszystkie aktywne sesje
  kont z resetowanych workspace'ów. Uczestnik musi zalogować się ponownie po
  reset — to akceptowalny, przewidywalny efekt uboczny, pokryty testem.
- Izolacja danych między workspace'ami warsztatowymi korzysta z tego samego,
  istniejącego mechanizmu `workspaceId`, co reszta aplikacji — nie
  wprowadzono żadnego nowego, osobnego mechanizmu izolacji.
- Panel `/admin` (wybór scenariusza, wybór błędu, UI resetu) pozostaje poza
  zakresem tego PR-a i zostanie dodany w `workshop-trainer-controls`.

## Pozostały zakres Workshop MVP

### 1. Minimalny Trainer Panel

Ukryty panel `/admin` tylko dla prowadzącego.

Musi pozwalać na:

- wybór globalnego scenariusza laboratorium;
- wybór jednego kontrolowanego błędu albo trybu `CLEAN`;
- zapis konfiguracji;
- reset danych warsztatowych do znanego stanu.

Nie budujemy pełnego panelu administracyjnego. Monitoring aplikacji, dashboard stanu bazy, rozbudowany RBAC, historia audytowa i zaawansowany UX są poza Workshop MVP.

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
