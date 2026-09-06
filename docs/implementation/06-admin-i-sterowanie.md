# Etap 6 — admin i sterowanie

**Status etapu:** `PLANNED`

## Zakres

- osobne uwierzytelnienie techniczne dla `/admin`;
- panel niewidoczny w nawigacji użytkownika;
- globalny wybór trybu symulatora laboratorium;
- globalny wybór opóźnienia;
- reset danych wszystkich workspace'ów;
- przywracanie trybu `CLEAN`;
- monitoring stanu aplikacji, bazy i symulatora;
- audyt operacji technicznych.

## Stan na `main`

Nie widać jeszcze modułu `/admin`, endpointów wewnętrznych panelu technicznego ani globalnego modelu sterowania środowiskiem. Etap pozostaje zaplanowany.

## Zasady realizacji

- `/admin` nie korzysta z kont `STAFF` ani uprawnień aplikacyjnych użytkowników.
- Sekrety panelu nie trafiają do repozytorium, logów ani dokumentacji dla uczestników.
- Reset musi być transakcyjny tam, gdzie pozwala na to MySQL, i nie może uruchamiać się automatycznie przy zwykłym deployu.
- Zmiany globalne powinny być audytowane.

## Dowody weryfikacji

Do uzupełnienia w PR-ach implementacyjnych: testy autoryzacji, testy resetu, wyniki CI i smoke testy środowiska.
