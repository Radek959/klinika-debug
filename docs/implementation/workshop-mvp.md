# Workshop MVP — Klinika Debug

## Cel

Klinika Debug jest środowiskiem do około 6-godzinnego warsztatu „Tester z AI”, a nie pełnym produktem SaaS. Zakres aplikacji ma wspierać konkretne ćwiczenia: pracę z dokumentacją, analizę wymagań, generowanie przypadków i danych testowych, risk-based testing, exploratory testing, raportowanie błędów, analizę API i logów oraz tworzenie prostych narzędzi z AI.

Priorytetem jest wartość dydaktyczna, stabilność i szybkie przygotowanie środowiska. Funkcja, która nie jest potrzebna w ćwiczeniu albo do prowadzenia warsztatu, nie należy do Workshop MVP.

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

### 3. Syntetyczne logi warsztatowe

Nie budujemy pełnego subsystemu observability tylko po to, aby ćwiczyć analizę logów.

Przygotowujemy kontrolowane fixture'y, np.:

- `happy-path.log`;
- `patient-error.log`;
- `lab-timeout.log`;
- `correlation-example.log`.

Logi muszą być syntetyczne i pozbawione danych wrażliwych. Powinny zawierać wystarczająco dużo informacji do ćwiczeń z correlationId i diagnozą problemu.

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
4. `workshop-log-fixtures` — syntetyczne logi i materiały do analizy;
5. `workshop-readiness` — smoke test, poprawki stabilności i finalizacja dokumentacji.

Każdy kolejny PR powstaje tylko wtedy, gdy wnosi wartość do konkretnego elementu warsztatu.
