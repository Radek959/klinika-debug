# Plan implementacji Kliniki Debug

## Cel katalogu

Ten katalog opisuje realizację **Workshop MVP**: minimalnego, stabilnego zakresu potrzebnego do około 6-godzinnego warsztatu „Tester z AI”. Klinika Debug jest środowiskiem do ćwiczeń, a nie pełnym produktem SaaS.

Dokumentacja produktowa opisuje wymagania i zachowanie aplikacji. Katalog `docs/implementation` opisuje, co jest potrzebne do warsztatu, co zostało zaimplementowane oraz co świadomie pozostaje poza zakresem.

### Hierarchia źródeł prawdy dla dalszego developmentu

1. [`docs/warsztat/przebieg-szkolenia.md`](../warsztat/przebieg-szkolenia.md) — czego rzeczywiście potrzebuje szkolenie;
2. [`workshop-mvp.md`](workshop-mvp.md) — zakres pozostałej implementacji;
3. [`../dokumentacja-produktowa.md`](../dokumentacja-produktowa.md) — poprawne zachowanie widoczne dla uczestnika;
4. [`../specyfikacja-mvp.md`](../specyfikacja-mvp.md) — wymagania Workshop MVP;
5. [`../architektura-techniczna.md`](../architektura-techniczna.md) — kierunek techniczny.

Starsze plany etapów są dokumentacją historyczną i nie mogą samodzielnie rozszerzać zakresu Workshop MVP.

## Aktualny etap prac

Etapy 1–4 tworzą gotowy rdzeń warsztatowy:

- fundament, sesje i izolacja workspace'ów;
- pacjenci;
- zlecenia, próbki i historia operacji;
- REST API i OpenAPI;
- symulator laboratorium;
- scenariusze `SUCCESS`, `PARTIAL_SUCCESS`, `SAMPLE_REJECTED`, `VALIDATION_ERROR`, `RATE_LIMIT`, `SERVER_ERROR`, `TIMEOUT`;
- pełne retry 15/30/60 s i `TECHNICAL_ERROR` po wyczerpaniu prób.

Nie rozwijamy dalej Etapów 1–4 bez konkretnej potrzeby warsztatowej.

Rekomendowany następny zakres: **Workshop MVP — izolowane workspace'y uczestników, minimalne sterowanie prowadzącego, 2–3 kontrolowane błędy, realistyczne syntetyczne logi i workshop readiness**.

## Granice narzędzi warsztatowych

Skrypt Python, rozszerzenie Chrome i lokalne narzędzia analityczne są tworzone podczas warsztatu przy pomocy AI albo pozostają lokalnymi artefaktami prowadzącego i uczestników. Nie są implementowane jako część aplikacji w tym repozytorium.

Notatki prowadzącego powstaną osobno na podstawie finalnej wersji produktu.

## Izolacja uczestników

Domyślny model warsztatu:

**1 uczestnik = 1 workspace + 1 konto STAFF.**

Jeżeli uczestnicy pracują parami, dopuszczalne jest 1 workspace na parę.

Osobne konta w tym samym workspace nie zapewniają niezależnych danych — pacjenci, zlecenia i inne zasoby są izolowane po `workspaceId`.

## Status zakresów

| Zakres | Status | Stan na `main` / decyzja |
|---|---|---|
| Etap 1 — fundament | `IMPLEMENTED` | Fundament aplikacji, deploymentu, sesji, workspace'ów, OpenAPI i testów jest obecny. |
| Etap 2 — pacjenci | `IMPLEMENTED` | Podstawowa obsługa pacjentów w API i UI jest obecna. |
| Etap 3 — zlecenia i próbki | `IMPLEMENTED` | Zlecenia, katalog badań, próbki, edycja `DRAFT` i historia operacji są zaimplementowane. |
| Etap 4 — laboratorium | `IMPLEMENTED` | Wysyłka, callbacki, retry i wszystkie potrzebne scenariusze laboratoryjne są zaimplementowane. |
| Workshop MVP — uczestnicy | `PLANNED` | Wiele izolowanych workspace'ów i kont warsztatowych + reset do znanego stanu. |
| Workshop MVP — trainer controls | `PLANNED` | Minimalny `/admin`: lab scenario, kontrolowany bug, reset. |
| Workshop MVP — controlled bugs | `PLANNED` | 2–3 deterministyczne defekty potrzebne do ćwiczeń. |
| Workshop MVP — log fixtures | `PLANNED` | Realistyczne syntetyczne logi zamiast pełnego subsystemu observability. |
| Workshop MVP — readiness | `PLANNED` | Smoke test całego przebiegu warsztatowego i stabilizacja. |
| Import / eksport | `OUT_OF_SCOPE` | Nie jest potrzebny do obecnej agendy warsztatu. |
| Rozbudowany observability | `OUT_OF_SCOPE` | Do ćwiczeń wystarczą kontrolowane fixture'y logów. |
| Pełny panel admina / monitoring / audyt | `OUT_OF_SCOPE` | Zastąpione minimalnymi trainer controls. |
| Ogólny framework pakietów błędów | `OUT_OF_SCOPE` | Zastąpiony 2–3 jawnymi, deterministycznymi defektami. |
| Gotowe rozszerzenie Chrome / skrypt Python | `OUT_OF_SCOPE` | Powstają podczas warsztatu lub jako lokalne materiały. |

## Plany

- [Workshop MVP](workshop-mvp.md)
- [Przebieg szkolenia](../warsztat/przebieg-szkolenia.md)
- [Etap 3 — zlecenia i próbki](03-zlecenia-i-probki.md)
- [Etap 4 — laboratorium](04-laboratorium.md)
- [Etap 5 — dane i obserwowalność](05-dane-i-obserwowalnosc.md) — zakres historyczny, obecnie `OUT_OF_SCOPE`
- [Etap 6 — admin i sterowanie](06-admin-i-sterowanie.md) — zastąpiony minimalnym trainer panelem
- [Etap 7 — kontrolowane błędy](07-kontrolowane-bledy.md) — zastąpiony 2–3 kontrolowanymi defektami

## Definicje statusów

| Status | Znaczenie |
|---|---|
| `PLANNED` | Zakres opisany, praca nierozpoczęta |
| `IN_PROGRESS` | Istnieje aktywna implementacja lub PR |
| `IMPLEMENTED` | Kod i testy znajdują się w PR/main |
| `VERIFIED` | Wymagane testy, CI i review zakończyły się powodzeniem |
| `DEPLOYED` | Zmiana została wdrożona i sprawdzona na Hostingerze |
| `SUPERSEDED` | Starszy plan zastąpiony przez aktualny Workshop MVP |
| `OUT_OF_SCOPE` | Obszar świadomie wyłączony z Workshop MVP |

## Definition of Done dla Workshop MVP

Workshop MVP jest gotowe, gdy:

- minimum 15 uczestników może pracować na niezależnych workspace'ach bez wpływania na dane innych osób;
- prowadzący może szybko zmienić scenariusz laboratorium, kontrolowany błąd i zresetować środowisko;
- dostępne są 2–3 deterministyczne błędy używane w konkretnych ćwiczeniach;
- dostępne są realistyczne syntetyczne logi do analizy;
- działają główne ścieżki pacjent → zlecenie → próbka → laboratorium → wynik;
- REST API i OpenAPI wspierają ćwiczenia;
- wykonano workshop readiness smoke test zgodny z `docs/warsztat/przebieg-szkolenia.md`;
- wszystkie wymagane bramki jakości są zielone;
- brak funkcji ze starego szerszego MVP blokujących finalizację.
