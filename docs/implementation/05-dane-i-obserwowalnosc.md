# Etap 5 — dane i obserwowalność

**Status etapu:** `PLANNED`

## Zakres

- presety danych `STANDARD` i `LARGE`;
- import pacjentów z CSV;
- eksport pacjentów i zleceń do CSV oraz JSON;
- ustrukturyzowane logi z `correlationId`;
- maskowanie danych pacjenta w logach;
- dokumentacja produktowa dostępna w aplikacji pod `/docs`;
- kompletna dokumentacja OpenAPI pod `/api/docs`.

## Stan na `main`

W kodzie istnieją podstawowe dane seed i dokumentacja OpenAPI dla obecnych endpointów, ale etap nie jest rozpoczęty jako spójny zakres produktowy. Nie widać jeszcze endpointów importu, eksportu, modułu logów technicznych ani publikowanego widoku `/docs`.

## Zasady realizacji

- Import i eksport muszą działać wyłącznie w bieżącym workspace.
- Import ma być atomowy i oparty na tych samych regułach walidacji co formularz pacjenta.
- Logi nie mogą zawierać pełnego PESEL-u, dokumentu, adresu, kontaktu ani wartości wyników.
- Materiały widoczne dla uczestników nie ujawniają panelu `/admin` ani wewnętrznego katalogu kontrolowanych błędów.

## Dowody weryfikacji

Do uzupełnienia w PR-ach implementacyjnych: komendy testowe, wyniki CI, linki do PR i ewentualne smoke testy.
