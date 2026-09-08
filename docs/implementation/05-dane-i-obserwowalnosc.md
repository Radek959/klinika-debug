# Etap 5 — dane i obserwowalność

**Status etapu:** `OUT_OF_SCOPE` dla Workshop MVP  
**Status historyczny:** pierwotnie `PLANNED`  
**Aktualne źródło prawdy:** [`workshop-mvp.md`](workshop-mvp.md)

## Decyzja

Pierwotny Etap 5 był zaprojektowany szerzej niż wymaga tego około 6-godzinne szkolenie „Tester z AI”. Nie realizujemy go jako osobnego etapu przed warsztatem.

Pierwotny zakres obejmował:

- presety danych `STANDARD` i `LARGE`;
- import pacjentów z CSV;
- eksport pacjentów i zleceń do CSV/JSON;
- pełne ustrukturyzowane logi runtime;
- wyszukiwanie/obserwowalność;
- publikację dokumentacji produktowej pod `/docs`.

## Co pozostaje potrzebne

Workshop MVP zachowuje wyłącznie elementy mające bezpośrednią wartość dydaktyczną:

- działające REST API i `/api/docs`;
- `correlationId` w rzeczywistym procesie aplikacji;
- syntetyczne, realistyczne log fixture'y zgodne z aplikacją;
- minimalne dane startowe przygotowane przez provisioning workspace'ów.

Log fixture'y nie wymagają budowania subsystemu observability. Szczegóły: `docs/specyfikacja-mvp.md` i `docs/warsztat/przebieg-szkolenia.md`.

## Świadomie poza Workshop MVP

- import CSV;
- eksport CSV/JSON;
- preset `LARGE`;
- przechowywanie logów technicznych w bazie;
- wyszukiwarka logów w aplikacji;
- osobny `/docs`.

Zakres może wrócić po warsztacie tylko na podstawie osobnej decyzji produktowej/dydaktycznej.
