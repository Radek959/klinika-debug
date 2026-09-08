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

### 3. Realistyczne syntetyczne logi warsztatowe

Nie budujemy pełnego subsystemu observability tylko po to, aby ćwiczyć analizę logów. Zamiast tego przygotowujemy **rozbudowane, realistyczne fixture'y logów**, które mają przypominać materiał spotykany w prawdziwych projektach, a nie krótkie przykłady dydaktyczne.

Logi są osobnym artefaktem warsztatowym, ale muszą być spójne z rzeczywistą architekturą Kliniki Debug, nazwami operacji, endpointami, statusami HTTP, mechanizmem `correlationId`, retry oraz scenariuszami laboratorium.

#### Minimalny zestaw scenariuszy

Przygotować co najmniej:

- `happy-path.log` — poprawna ścieżka od requestu użytkownika do wysłania zlecenia i wyniku;
- `patient-validation-error.log` — problem walidacyjny lub kontrolowany błąd związany z pacjentem;
- `order-flow-error.log` — problem w procesie zlecenia/próbek/statusów;
- `lab-timeout-retry.log` — timeout integracji, retry 15/30/60 s i końcowy sukces albo `TECHNICAL_ERROR`;
- `api-diagnostics.log` — problem wymagający połączenia obserwacji z UI, request/response API i wpisów backendu;
- `correlation-trace.log` — pełny ślad jednego zdarzenia przez kilka komponentów za pomocą wspólnego `correlationId`;
- `noisy-production-like.log` — większy plik z wieloma równoległymi requestami i wpisami niezwiązanymi z właściwą przyczyną problemu.

#### Charakter logów

Każdy scenariusz powinien zawierać wystarczająco dużo wpisów, żeby uczestnik musiał analizować i filtrować materiał. Nie projektujemy logów jako „jedna linia błędu + odpowiedź”.

Fixture'y powinny zawierać realistyczną mieszankę:

- timestampów z milisekundami;
- poziomów `DEBUG`, `INFO`, `WARN`, `ERROR`;
- nazwy komponentu/modułu lub loggera;
- `correlationId`;
- bezpiecznego `workspaceId` lub syntetycznego identyfikatora kontekstu, jeśli jest potrzebny do diagnozy;
- metody HTTP, ścieżki endpointu i statusu odpowiedzi;
- czasu wykonania requestu;
- identyfikatorów zasobów, np. `orderId`, `jobId`, `eventId`, ale bez PII;
- operacji bazy lub repozytorium opisanych na poziomie technicznym bez pełnego SQL zawierającego dane;
- wywołań do symulatora laboratorium;
- informacji o retry, numerze próby i kolejnym terminie;
- komunikatów o timeoutach, 429, 503, 504 i błędach walidacji;
- ostrzeżeń, które nie są przyczyną głównego problemu;
- poprawnych wpisów przeplatanych z błędnymi;
- kilku równoległych `correlationId`, żeby wymusić filtrowanie;
- technicznego kontekstu błędu przypominającego stack trace lub exception chain, ale bez ujawniania sekretów i danych pacjenta.

#### Realizm diagnostyczny

W części scenariuszy właściwa przyczyna nie może być podana wprost w jednej linii. Uczestnik powinien musieć np.:

1. znaleźć właściwy `correlationId` na podstawie requestu lub odpowiedzi API;
2. odfiltrować wpisy innych użytkowników/requestów;
3. połączyć kilka wpisów z różnych etapów przepływu;
4. odróżnić symptom od przyczyny;
5. zauważyć retry albo wcześniejsze ostrzeżenie prowadzące do błędu;
6. sformułować hipotezę i wskazać, czego nie da się potwierdzić wyłącznie z logów.

Co najmniej jeden scenariusz powinien zawierać **mylny trop**: ostrzeżenie lub błąd czasowo bliski incydentowi, ale niezwiązany z jego przyczyną. Ma to pokazać, że AI również może błędnie wskazać najbardziej „krzykliwy” wpis jako root cause.

#### Format

Preferowany jest ustrukturyzowany format zbliżony do produkcyjnych logów JSON Lines (`.jsonl`) albo czytelny format tekstowy konsekwentny w całym zbiorze. Można dostarczyć oba warianty dla wybranych ćwiczeń.

Przykładowy kształt pojedynczego wpisu:

```json
{"timestamp":"2026-09-08T10:14:32.481Z","level":"WARN","service":"api","component":"LabSendRetryService","correlationId":"corr-demo-17","workspaceId":"ws-demo-07","orderId":"ord-demo-884","event":"lab_send_retry_scheduled","attemptNumber":2,"httpStatus":504,"retryAfterSeconds":15,"durationMs":30012,"message":"Laboratorium nie odpowiedziało w wymaganym czasie. Zaplanowano ponowienie wysyłki."}
```

To tylko przykład formatu — finalne fixture'y muszą tworzyć wieloliniowe, spójne historie diagnostyczne.

#### Rozmiar

Nie ustalamy sztywnej liczby linii, ale:

- prostszy scenariusz powinien mieć raczej dziesiątki niż kilka wpisów;
- scenariusze diagnostyczne powinny mieć około 100+ wpisów, jeśli jest to potrzebne do realistycznego filtrowania;
- `noisy-production-like.log` może mieć kilkaset wpisów z wieloma równoległymi operacjami.

Celem nie jest sztuczne zwiększanie objętości, tylko stworzenie materiału, na którym faktycznie warto użyć AI do analizy.

#### Bezpieczeństwo danych

Logi muszą być w 100% syntetyczne. Nie mogą zawierać:

- prawdziwych danych osobowych;
- pełnego PESEL-u ani numeru dokumentu;
- danych kontaktowych lub adresowych;
- wartości wyników medycznych powiązanych z osobą;
- haseł, tokenów sesji, API keys i innych sekretów;
- pełnych request payloadów, jeżeli mogłyby zawierać powyższe dane.

Jeżeli scenariusz wymaga pokazania problemu z nadmiernym logowaniem danych, należy użyć wyłącznie jawnie syntetycznych wartości testowych i opisać to jako kontrolowany defekt warsztatowy.

#### Kryterium jakości

Fixture'y są gotowe dopiero wtedy, gdy prowadzący może zadać AI pytanie typu:

> Przeanalizuj te logi i wskaż najbardziej prawdopodobną przyczynę problemu, dowody wspierające wniosek, alternatywne hipotezy oraz informacje, których brakuje do potwierdzenia root cause.

Odpowiedź nie powinna być oczywista na podstawie jednej linii. Materiał ma pozwalać porównywać jakość analizy różnych modeli oraz pokazywać ryzyko halucynacji i nadinterpretacji logów.

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
9. przejście co najmniej jednego realistycznego scenariusza analizy logów;
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
4. `workshop-log-fixtures` — realistyczne, rozbudowane logi diagnostyczne i materiały do analizy;
5. `workshop-readiness` — smoke test, poprawki stabilności i finalizacja dokumentacji.

Każdy kolejny PR powstaje tylko wtedy, gdy wnosi wartość do konkretnego elementu warsztatu.
