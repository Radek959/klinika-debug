# Tester z AI — planowany przebieg szkolenia i wymagania wobec Kliniki Debug

**Status:** źródło prawdy dla zakresu dydaktycznego Workshop MVP  
**Aplikacja:** Klinika Debug  
**Docelowy czas pracy z aplikacją i materiałami praktycznymi:** około 5–6 godzin  
**Dokumenty powiązane:** `docs/implementation/workshop-mvp.md`, `docs/warsztat/agenda-bloki-4-7.md`

## 1. Cel dokumentu

Ten dokument opisuje planowany przebieg części praktycznej szkolenia „Tester z AI” i łączy każdy blok szkolenia z konkretnymi wymaganiami wobec Kliniki Debug.

Ma zapobiegać rozbudowie aplikacji o funkcje, które nie wnoszą wartości dydaktycznej. Jeżeli planowana funkcja nie wspiera żadnego elementu tego przebiegu ani przygotowania środowiska przez prowadzącego, nie należy do Workshop MVP.

Klinika Debug jest realistycznym projektem testowym, a nie produktem docelowym. Aplikacja ma dostarczać wystarczająco dużo domeny, API, danych i problemów diagnostycznych, aby uczestnik pracował podobnie jak w prawdziwym projekcie.

## 2. Zasady prowadzenia

1. Dokładnie dwa pierwsze ćwiczenia porównują pracę bez dokumentacji i z dokumentacją.
2. Po tym porównaniu dokumentacja produktowa staje się obowiązkowym kontekstem.
3. AI jest asystentem; uczestnik weryfikuje odpowiedzi w dokumentacji, aplikacji, API i logach.
4. Te same dane i ten sam proces są wykorzystywane w wielu blokach, zamiast tworzenia niezależnych sztucznych zadań.
5. Każdy uczestnik pracuje we własnym workspace i nie wpływa na dane innych uczestników.
6. Kontrolowane defekty i panel prowadzącego nie są ujawniane w dokumentacji produktowej uczestnika.
7. Narzędzia tworzone podczas szkolenia, np. skrypt Python i rozszerzenie Chrome, nie są gotowymi funkcjami Kliniki Debug.

## 3. Przebieg szkolenia

### Etap A — poznanie projektu

Uczestnik otrzymuje:

- adres aplikacji;
- własny login i hasło;
- własny workspace;
- dokumentację produktową;
- dostęp do dokumentacji OpenAPI;
- wybrane materiały pomocnicze.

Wymagania wobec aplikacji:

- stabilne logowanie;
- izolacja danych per workspace;
- polski interfejs;
- działająca główna ścieżka pacjent → zlecenie → próbka → laboratorium → wynik.

### Etap B — eksperyment z kontekstem

#### Ćwiczenie 1 — przypadki testowe bez dokumentacji

Uczestnik prosi AI o przypadki testowe dla ogólnie opisanej aplikacji medycznej.

Cel: zauważyć założenia, wymyślone funkcje i brak zgodności z realnym produktem.

Wymagania wobec aplikacji:

- realistyczny proces tworzenia zlecenia;
- wystarczająco dużo reguł, aby ogólna odpowiedź AI była zauważalnie mniej precyzyjna od odpowiedzi opartej na dokumentacji.

#### Ćwiczenie 2 — dane testowe bez dokumentacji

Uczestnik prosi AI o dane dla polskiego formularza pacjenta.

Cel: sprawdzić PESEL, datę urodzenia, płeć, małoletność, opiekuna, dane bez PESEL-u i walidacje formularza.

Wymagania wobec aplikacji:

- formularz pacjenta z realnymi zależnościami walidacyjnymi;
- możliwość wykonania testów pozytywnych i negatywnych.

#### Powtórzenie z dokumentacją

Te same dwa zadania są wykonywane ponownie z dokumentacją produktową jako źródłem prawdy.

Od tego momentu wszystkie kolejne ćwiczenia korzystają z dokumentacji.

### Etap C — AI w codziennej pracy testera

Na tym samym projekcie uczestnicy wykorzystują AI do:

- analizy wymagań;
- wykrywania luk i sprzeczności;
- generowania pytań do biznesu;
- przygotowania przypadków testowych;
- risk-based testing;
- wyboru minimalnej regresji;
- przygotowania sesji exploratory testing;
- raportowania błędów.

Preferowany proces do ćwiczeń:

> aktywny pacjent → zlecenie kilku badań → różne materiały → rejestracja próbek → wysłanie do laboratorium → wynik częściowy → wynik kompletny

Wymagania wobec aplikacji:

- pacjenci;
- katalog badań;
- grupowanie badań według materiału;
- zlecenia i edycja DRAFT;
- częściowe pobranie próbek;
- statusy procesu;
- historia operacji;
- wyniki częściowe i kompletne.

### Etap D — dane testowe

Uczestnicy generują i weryfikują zestawy danych do formularza pacjenta oraz wybranych procesów.

AI ma pomagać w budowaniu tabel danych, ale dane są sprawdzane przez dokumentację i aplikację.

Wymagania wobec aplikacji:

- własny workspace uczestnika;
- możliwość wielokrotnego tworzenia pacjentów i zleceń;
- jednoznaczne walidacje i komunikaty błędów;
- brak konieczności implementowania importu CSV tylko na potrzeby tego ćwiczenia.

### Etap E — investigation: UI → DevTools → API

Prowadzący aktywuje wybrany scenariusz albo kontrolowany defekt.

Uczestnik zaczyna od zachowania widocznego w UI, a następnie przechodzi do DevTools i API.

Przykładowa ścieżka:

> akcja w UI → request HTTP → odpowiedź 4xx/5xx → `correlationId` → hipotezy → dalsze dowody

Wymagania wobec aplikacji:

- REST API wykorzystywane przez UI;
- czytelne requesty i odpowiedzi;
- jednolity format błędów;
- `correlationId` w odpowiedzi i historii;
- scenariusze `VALIDATION_ERROR`, `RATE_LIMIT`, `SERVER_ERROR`, `TIMEOUT`;
- retry i stan `TECHNICAL_ERROR`;
- minimalny panel prowadzącego pozwalający kontrolować scenariusz globalnie.

### Etap F — analiza realistycznych logów

Uczestnik dostaje syntetyczny, ale production-like materiał logowy.

Log nie jest prostym zbiorem kilku wpisów. Ma zawierać:

- co najmniej 100 wpisów w scenariuszu diagnostycznym;
- w większym materiale kilkaset wpisów;
- równoległe requesty i wiele `correlationId`;
- `DEBUG`, `INFO`, `WARN`, `ERROR`;
- requesty HTTP, retry, timeouty, 429/503/504;
- zdarzenia schedulera i integracji z laboratorium;
- szum informacyjny;
- mylne tropy, w tym niezwiązane wpisy `ERROR`;
- wystarczający kontekst do odtworzenia chronologii, ale nie oczywisty root cause w jednej linii.

Ćwiczenie polega na:

- filtrowaniu po `correlationId`;
- odtworzeniu chronologii;
- oddzieleniu faktów od hipotez;
- rozróżnieniu symptomu od przyczyny;
- wskazaniu alternatywnych hipotez;
- wskazaniu brakujących informacji potrzebnych do potwierdzenia diagnozy.

Wymagania wobec aplikacji:

- spójne `correlationId` w głównym procesie;
- log fixture'y zgodne z nazwami endpointów, statusami, retry i zachowaniem prawdziwej aplikacji.

Pełny subsystem observability nie jest wymagany.

### Etap G — raport błędu

Uczestnik buduje zgłoszenie na podstawie realnego zestawu dowodów:

- zachowanie UI;
- kroki wykonane przez uczestnika;
- request i response;
- `correlationId`;
- fragment logów;
- dokumentacja produktowa.

AI przygotowuje draft raportu. Uczestnik sprawdza, czy model:

- nie wymyślił kroków;
- nie podał hipotezy jako potwierdzonego root cause;
- poprawnie wyprowadził expected result z dokumentacji;
- sensownie uzasadnił severity i priority.

Wymagania wobec aplikacji:

- 2–3 deterministyczne kontrolowane defekty;
- defekty muszą dawać obserwowalne dowody w UI/API/logach;
- możliwość szybkiego przywrócenia trybu `CLEAN`.

### Etap H — API z AI

Uczestnicy używają OpenAPI i wybranego klienta lub AI do:

- zrozumienia endpointów;
- przygotowania requestów;
- analizy kontraktów i błędów;
- tworzenia scenariuszy negatywnych;
- pracy z autoryzacją i `correlationId`.

Wymagania wobec aplikacji:

- kompletne OpenAPI dla endpointów używanych na szkoleniu;
- REST API dostępne dla konta uczestnika;
- brak potrzeby implementowania osobnego `/docs`, jeśli dokumentacja produktowa może być przekazana jako plik.

### Etap I — tworzenie własnych narzędzi z AI

Uczestnik może stworzyć np.:

- skrypt Python korzystający z API;
- skrypt analizujący logi;
- rozszerzenie Chrome pomagające w pracy z DevTools lub `correlationId`.

Implementacje tych narzędzi nie trafiają do repozytorium Kliniki Debug. Repo ma dostarczać stabilne API, dokumentację i dane potrzebne do ich stworzenia.

## 4. Panel prowadzącego

Panel `/admin` jest narzędziem prowadzącego, nie częścią doświadczenia uczestnika.

Workshop MVP wymaga tylko:

- wyboru globalnego scenariusza laboratorium;
- wyboru `CLEAN` albo jednego kontrolowanego defektu;
- resetu danych wszystkich workspace'ów warsztatowych;
- prostego potwierdzenia aktualnej konfiguracji.

Nie są potrzebne: pełny monitoring, dashboard bazy, zaawansowany RBAC, rozbudowany audyt ani zarządzanie użytkownikami przez UI.

## 5. Kontrolowane defekty

Workshop MVP powinien posiadać 2–3 defekty o różnym charakterze.

### `PATIENT_GUARDIAN`

Defekt związany z regułą pacjenta niepełnoletniego i opiekuna. Przydatny do analizy wymagań, exploratory testing, danych testowych i raportowania błędu.

### `ORDER_FLOW`

Defekt w procesie zlecenia, próbek albo przejściu statusów. Przydatny do risk-based testing i zakresu regresji.

### `API_DIAGNOSTICS`

Defekt, którego sensowna diagnoza wymaga przejścia z UI do DevTools/API i użycia `correlationId`. Preferowany jako scenariusz spinający investigation, logi i bug report.

Defekty nie są opisane w dokumentacji produktowej dla uczestników.

## 6. Mapa: element szkolenia → funkcja aplikacji

| Element szkolenia | Potrzebna funkcja Kliniki Debug |
|---|---|
| kontekst vs brak kontekstu | dokumentacja + realne reguły domenowe |
| test cases | pacjent, zlecenie, próbki, statusy |
| dane testowe | formularz pacjenta i walidacje |
| requirements analysis | dokumentacja produktowa |
| risk-based testing | pełny proces zlecenia |
| exploratory testing | stabilne UI + własne dane uczestnika |
| DevTools | UI korzystające z REST API |
| API | OpenAPI + token STAFF |
| analiza błędów | kontrolowany scenariusz lub defekt |
| correlation | `correlationId` w API, historii i logach |
| log analysis | realistyczne log fixture'y |
| bug report | defekt + dokumentacja + dowody |
| Python/Chrome | stabilne API i dokumentacja |

## 7. Funkcje, których szkolenie nie wymaga

Bez osobnej decyzji dydaktycznej nie implementujemy:

- importu CSV;
- eksportu CSV/JSON;
- rozbudowanego dashboardu użytkownika;
- systemu powiadomień;
- pełnego observability i wyszukiwarki logów w aplikacji;
- widoku `/docs`;
- monitoringu infrastruktury w `/admin`;
- audytu wszystkich operacji prowadzącego;
- ogólnego frameworka pakietów błędów;
- rozbudowanego zarządzania kontami przez UI;
- gotowego rozszerzenia Chrome;
- gotowego skryptu Python.

## 8. Definition of Done aplikacji warsztatowej

Klinika Debug jest gotowa, gdy:

1. co najmniej 15 uczestników może równocześnie pracować na odseparowanych danych;
2. każdy może przejść główny proces od pacjenta do wyniku;
3. REST API i OpenAPI wspierają ćwiczenia;
4. prowadzący może zmienić scenariusz laboratorium, aktywować jeden defekt i zresetować środowisko;
5. istnieją 2–3 użyteczne kontrolowane defekty;
6. istnieje zestaw realistycznych fixture'ów logów;
7. materiały produktowe są zgodne z zachowaniem `CLEAN`;
8. przeprowadzono pełny smoke test zgodny z przebiegiem szkolenia;
9. nie ma otwartych funkcji wymaganych wyłącznie przez stary, szerszy zakres MVP.
