# Klinika Debug — specyfikacja Workshop MVP

**Wersja:** 2.0  
**Status:** zaakceptowana  
**Dokumenty bazowe:** `docs/dokumentacja-produktowa.md`, `docs/warsztat/przebieg-szkolenia.md`, `docs/implementation/workshop-mvp.md`

## 1. Cel MVP

Celem Workshop MVP jest dostarczenie stabilnego środowiska do szkolenia „Tester z AI”, w którym co najmniej 15 uczestników może równocześnie pracować na odseparowanych danych i przejść proces:

> pacjent → zlecenie badań → rejestracja próbek → wysłanie do laboratorium → wynik / kontrolowany problem → investigation

Aplikacja nie jest rozwijana jako pełny system medyczny ani SaaS. Każdy element zakresu musi wspierać konkretny blok szkolenia albo obsługę środowiska przez prowadzącego.

## 2. Hierarchia źródeł prawdy

Przy decyzjach o zakresie obowiązuje kolejność:

1. `docs/warsztat/przebieg-szkolenia.md` — czego wymaga szkolenie;
2. `docs/implementation/workshop-mvp.md` — co jeszcze należy zaimplementować;
3. `docs/dokumentacja-produktowa.md` — poprawne zachowanie widoczne dla uczestnika;
4. `docs/architektura-techniczna.md` — techniczny sposób realizacji;
5. plany wcześniejszych etapów — historia implementacji, nie źródło nowego zakresu.

Jeżeli starszy dokument wymaga funkcji niewykorzystywanej w przebiegu szkolenia, funkcja nie należy do Workshop MVP bez jawnej decyzji właściciela projektu.

## 3. Zasady projektowe

1. **Warsztat przed produktem** — wartość dydaktyczna ma pierwszeństwo przed kompletnością produktu.
2. **Jeden spójny proces** — priorytetem jest pełna ścieżka pacjent → wynik.
3. **Poprawny tryb `CLEAN`** — bez aktywnego defektu system działa zgodnie z dokumentacją produktową.
4. **Deterministyczne scenariusze** — zachowanie szkoleniowe można powtórzyć i wyłączyć.
5. **Globalne sterowanie scenariuszem** — konfiguracja prowadzącego obowiązuje całe środowisko.
6. **Odseparowane dane uczestników** — każdy uczestnik pracuje we własnym workspace.
7. **Brak prawdziwych danych** — wyłącznie dane syntetyczne.
8. **API jako część ćwiczeń** — operacje są obserwowalne przez REST API i `correlationId`.
9. **Szybki reset** — środowisko można przywrócić do znanego stanu przed kolejną grupą lub blokiem.
10. **Minimalna architektura** — nie budujemy ogólnych frameworków, jeżeli wystarcza proste rozwiązanie workshopowe.

## 4. Stan rdzenia aplikacji

Etapy 1–4 dostarczają główny proces i są traktowane jako istniejący rdzeń Workshop MVP:

- uwierzytelnienie `STAFF`;
- workspace'y i izolacja danych;
- pacjenci i opiekunowie;
- katalog badań;
- zlecenia i edycja `DRAFT`;
- wymagane próbki;
- historia operacji;
- REST API i OpenAPI;
- symulator laboratorium;
- wynik kompletny i częściowy;
- odrzucenie próbki;
- odrzucenie walidacyjne;
- 429, 503 i 504;
- trwałe retry 15/30/60;
- `TECHNICAL_ERROR`;
- `correlationId`.

Bez konkretnej potrzeby z `docs/warsztat/przebieg-szkolenia.md` nie rozszerzamy już tych obszarów o dodatkowe funkcje produktowe.

## 5. Uczestnicy i izolacja danych

### 5.1. Model dostępu

Domyślna konfiguracja:

**1 uczestnik = 1 workspace + 1 konto `STAFF`.**

Dla pracy parami dopuszczalne jest 1 workspace na parę.

Wymagania:

- minimum 15 workspace'ów uczestników oraz możliwość utworzenia zapasowych;
- co najmniej jedno aktywne konto `STAFF` w każdym workspace;
- globalnie unikalne loginy, np. `tester01`–`tester15`;
- brak samodzielnej rejestracji;
- użytkownik widzi wyłącznie dane własnego workspace'u;
- testy integracyjne potwierdzają izolację.

### 5.2. Provisioning

Musi istnieć prosty, powtarzalny mechanizm przygotowania środowiska, np. skrypt/seed:

```text
npm run workshop:seed -- --participants=15
```

Dokładna nazwa komendy może się różnić, ale rozwiązanie ma:

- tworzyć wymagane workspace'y;
- tworzyć konta `STAFF`;
- tworzyć minimalne dane początkowe potrzebne do ćwiczeń;
- być idempotentne albo posiadać jednoznaczną procedurę resetu;
- nie wymagać ręcznych operacji SQL.

Nie budujemy panelu CRUD do zarządzania uczestnikami.

## 6. Minimalny panel prowadzącego

Panel techniczny znajduje się pod `/admin` i nie jest widoczny dla kont `STAFF`.

Workshop MVP wymaga wyłącznie:

1. wyboru globalnego scenariusza laboratorium;
2. wyboru `CLEAN` albo jednego kontrolowanego defektu;
3. zapisania konfiguracji;
4. wyświetlenia aktualnej konfiguracji;
5. resetu danych wszystkich workspace'ów warsztatowych do znanego stanu.

### 6.1. Dostęp

- `/admin` nie korzysta z roli `STAFF`;
- mechanizm dostępu jest oddzielony od kont uczestników;
- sekret nie trafia do repo, logów ani dokumentacji uczestnika;
- panel nie jest linkowany w zwykłej nawigacji.

### 6.2. Poza zakresem panelu

Nie implementujemy dla Workshop MVP:

- dashboardu infrastruktury;
- monitoringu MySQL;
- historii wszystkich zmian admina;
- rozbudowanego RBAC;
- zarządzania użytkownikami przez UI;
- rozbudowanego systemu alertów;
- zaawansowanego UX.

## 7. Kontrolowane defekty

Zamiast ogólnego frameworka pakietów błędów implementujemy **2–3 jawne, deterministyczne defekty szkoleniowe**.

Aktywny może być maksymalnie jeden defekt.

`CLEAN` oznacza zachowanie zgodne z dokumentacją produktową.

### 7.1. `PATIENT_GUARDIAN`

Defekt związany z regułą pacjenta niepełnoletniego i opiekuna.

Powinien być użyteczny do:

- danych testowych;
- analizy wymagań;
- exploratory testing;
- bug reportu.

### 7.2. `ORDER_FLOW`

Defekt w procesie zlecenia, próbek lub przejściu statusów.

Powinien być użyteczny do:

- risk-based testing;
- minimalnej regresji;
- testowania procesu biznesowego.

### 7.3. `API_DIAGNOSTICS`

Defekt wymagający przejścia z UI do DevTools/API i użycia `correlationId`.

Powinien spinać:

- investigation UI;
- request/response;
- logi;
- raport błędu.

### 7.4. Wymagania techniczne dla defektów

- defekt jest deterministyczny;
- jest możliwy do włączenia i wyłączenia globalnie;
- `CLEAN` ma test regresyjny;
- aktywowany defekt ma test potwierdzający oczekiwane, celowo niepoprawne zachowanie;
- implementacja nie może przypadkowo wpływać na inne scenariusze;
- wewnętrzna nazwa defektu nie jest ujawniana uczestnikowi;
- nie tworzymy dodatkowej warstwy pluginów/strategii, jeżeli prosty warunek w odpowiedniej warstwie jest czytelniejszy.

## 8. Scenariusze laboratorium

Workshop MVP korzysta z istniejących scenariuszy:

- `SUCCESS`;
- `PARTIAL_SUCCESS`;
- `SAMPLE_REJECTED`;
- `VALIDATION_ERROR`;
- `RATE_LIMIT`;
- `SERVER_ERROR`;
- `TIMEOUT`.

Panel prowadzącego zmienia aktywny scenariusz globalnie.

Scenariusze laboratorium reprezentują zachowanie integracji i nie są kontrolowanymi defektami produktu.

## 9. Logi warsztatowe

Pełny subsystem observability nie jest wymagany.

Workshop MVP dostarcza zestaw syntetycznych fixture'ów odzwierciedlających realny projekt.

### 9.1. Minimalny zestaw

Rekomendowane materiały:

- `happy-path.log`;
- `patient-error.log`;
- `order-flow.log`;
- `lab-timeout.log`;
- `api-diagnostics.log`;
- `correlation-trace.log`;
- `production-like.log`.

### 9.2. Realizm

Scenariusz diagnostyczny powinien mieć co najmniej około 100 wpisów. `production-like.log` może mieć kilkaset wpisów.

Logi zawierają:

- timestamp;
- poziom `DEBUG`, `INFO`, `WARN`, `ERROR`;
- nazwę komponentu/serwisu;
- `correlationId` tam, gdzie dotyczy;
- metodę HTTP i ścieżkę;
- status HTTP;
- czas wykonania;
- zdarzenia schedulera i retry;
- błędy integracji;
- równoległe, niezwiązane operacje;
- szum informacyjny;
- co najmniej jeden wiarygodny mylny trop.

Root cause nie może być podany wprost w jednej oczywistej linii.

### 9.3. Spójność z aplikacją

Fixture'y muszą używać rzeczywistych:

- nazw endpointów;
- kodów błędów;
- statusów;
- harmonogramu retry;
- formatów `correlationId`;
- nazw istotnych komponentów.

Nie zawierają prawdziwych danych osobowych, sekretów ani wartości medycznych pochodzących z rzeczywistych systemów.

## 10. REST API i OpenAPI

Endpointy używane w szkoleniu muszą:

- być dostępne dla użytkownika `STAFF`;
- mieć aktualne OpenAPI;
- stosować spójny format błędów;
- propagować `correlationId` tam, gdzie ma znaczenie diagnostyczne;
- nie ujawniać konfiguracji prowadzącego ani nazw kontrolowanych defektów.

Nie implementujemy osobnego widoku `/docs`, jeżeli dokumentacja produktowa może być przekazana uczestnikowi jako plik.

## 11. Reset środowiska

Reset musi:

- działać globalnie dla środowiska warsztatowego;
- usuwać/odtwarzać dane uczestników do zdefiniowanego stanu;
- zachowywać katalog badań i inne wymagane dane referencyjne;
- przywracać scenariusz laboratorium do bezpiecznego domyślnego stanu;
- przywracać kontrolowany defekt do `CLEAN`;
- nie wymagać ręcznych zmian w bazie;
- być możliwy do wykonania przez prowadzącego przed szkoleniem i pomiędzy grupami.

Implementacja powinna współdzielić mechanizm z provisioningiem, zamiast tworzyć dwa niezależne sposoby seedowania danych.

## 12. Workshop readiness

Ostatnim etapem jest pełny smoke test zgodny z przebiegiem szkolenia.

Minimalna ścieżka:

1. przygotowanie minimum 15 workspace'ów;
2. równoległe logowanie kilku kont;
3. utworzenie i edycja pacjenta;
4. utworzenie zlecenia;
5. częściowa i pełna rejestracja próbek;
6. wysłanie do laboratorium;
7. `SUCCESS`;
8. `PARTIAL_SUCCESS`;
9. co najmniej jeden retryowalny problem integracyjny;
10. aktywacja każdego kontrolowanego defektu;
11. analiza requestu/response i `correlationId`;
12. sprawdzenie fixture'ów logów;
13. reset środowiska;
14. ponowne przejście głównej ścieżki po resecie.

Po pozytywnym workshop readiness development Workshop MVP jest zakończony.

## 13. Świadomie poza zakresem

Nie implementujemy przed szkoleniem:

- importu CSV;
- eksportu CSV/JSON;
- presetów danych typu `LARGE`;
- pełnego modułu observability;
- przechowywania i wyszukiwania logów technicznych w aplikacji;
- powiadomień użytkownika;
- osobnego `/docs`;
- dashboardu analitycznego;
- rozbudowanego monitoringu `/admin`;
- pełnego audytu admina;
- ogólnego frameworka pakietów błędów;
- pakietów `PATIENT_DATA`, `ORDER_FLOW`, `LAB_INTEGRATION`, `LOGS`, `PERFORMANCE` jako osobnej architektury;
- gotowego rozszerzenia Chrome;
- gotowego skryptu Python;
- narzędzi wydajnościowych w repozytorium aplikacji.

## 14. Definition of Done Workshop MVP

Workshop MVP jest gotowy, gdy:

- minimum 15 uczestników może pracować równocześnie bez mieszania danych;
- główny proces działa w trybie `CLEAN`;
- CI i testy izolacji workspace'ów są zielone;
- prowadzący może sterować scenariuszem laboratorium;
- prowadzący może włączyć `CLEAN` lub jeden z 2–3 defektów;
- reset działa powtarzalnie;
- OpenAPI odpowiada rzeczywistemu API;
- realistyczne fixture'y logów są gotowe;
- dokumentacja produktowa jest zgodna z trybem `CLEAN`;
- pełny smoke test szkolenia został wykonany;
- brak niewykorzystanych przez szkolenie funkcji blokujących finalizację.
