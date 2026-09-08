# Etap 7 — kontrolowane błędy

**Status etapu:** `SUPERSEDED` przez Workshop MVP  
**Status historyczny:** pierwotnie `PLANNED`  
**Aktualne źródło prawdy:** [`workshop-mvp.md`](workshop-mvp.md)

## Decyzja

Pierwotny Etap 7 zakładał ogólny mechanizm pakietów błędów i pięć kategorii defektów. To zbyt szeroki zakres jak na narzędzie do około 6-godzinnego szkolenia.

Nie budujemy frameworka pakietów błędów.

## Wymagany zakres Workshop MVP

Implementujemy 2–3 deterministyczne defekty szkoleniowe:

- `PATIENT_GUARDIAN` — reguły pacjenta niepełnoletniego/opiekuna;
- `ORDER_FLOW` — proces zlecenia, próbek lub statusów;
- `API_DIAGNOSTICS` — problem wymagający przejścia z UI do DevTools/API i `correlationId`.

Zasady:

- `CLEAN` oznacza poprawne zachowanie zgodne z dokumentacją produktową;
- aktywny może być maksymalnie jeden defekt;
- defekty są globalne, nie per konto/workspace;
- każdy defekt jest deterministyczny;
- każdy defekt można łatwo wyłączyć;
- testy potwierdzają zarówno `CLEAN`, jak i celowo zmienione zachowanie;
- wewnętrzna nazwa defektu nie jest ujawniana uczestnikowi.

## Świadomie odrzucony zakres

Nie implementujemy przed warsztatem:

- ogólnego frameworka pluginów/strategii;
- pakietów `PATIENT_DATA`, `ORDER_FLOW`, `LAB_INTEGRATION`, `LOGS`, `PERFORMANCE` jako osobnej architektury;
- wielu jednocześnie aktywnych błędów;
- konfiguracji defektów per workspace;
- katalogu defektów dostępnego przez UI uczestnika.

Szczegóły: `docs/specyfikacja-mvp.md`, `docs/architektura-techniczna.md`, `docs/warsztat/przebieg-szkolenia.md`.
