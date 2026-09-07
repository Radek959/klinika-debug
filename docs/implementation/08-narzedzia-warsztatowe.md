# Etap 8 — narzędzia warsztatowe

**Status etapu:** `OUT_OF_SCOPE` dla implementacji w tym repozytorium

## Zakres

Narzędzia warsztatowe korzystają z Kliniki Debug, ale nie są etapem implementacji aplikacji. Gotowe rozszerzenie Chrome, skrypt Python ani notatki prowadzącego nie powstają w tym repozytorium.

Repozytorium ma zapewnić stabilne:

- formularze użytkownika;
- REST API;
- dokumentację OpenAPI;
- dane syntetyczne;
- historię operacji;
- `correlationId` w odpowiedziach, błędach i logach.

## Przygotowanie warsztatu

Przed warsztatem zostaną przygotowane wymagania, kryteria weryfikacji i prompty potrzebne do ćwiczeń. Powstaną poza repozytorium, w notatkach prowadzącego w Notion, po zakończeniu aplikacji i sprawdzeniu docelowego wdrożenia.

Notatki prowadzącego będą zawierały ćwiczenia i prompty umieszczone bezpośrednio w poszczególnych blokach. Nie powstanie osobna baza ćwiczeń, a dokumentacja produktowa nie będzie zawierała notatek prowadzącego.

## Wykonanie podczas warsztatu

Podczas warsztatu narzędzia zostaną stworzone na żywo przy pomocy AI, na podstawie aktualnego zachowania aplikacji, OpenAPI i przygotowanych kryteriów. Dotyczy to między innymi:

- rozszerzenia Chrome wspierającego pracę z formularzami;
- skryptu Python do ćwiczeń z API;
- lokalnego narzędzia do analizy zdarzeń po `correlationId`.

Rezultat ćwiczenia może pozostać lokalnie u prowadzącego albo uczestników. Repozytorium Kliniki Debug nie przechowuje gotowych implementacji tych narzędzi.

## Zasady

- Narzędzia używają wyłącznie danych syntetycznych.
- Narzędzia nie zapisują haseł, tokenów ani sekretów w kodzie lub wynikach.
- Interfejsy narzędzi widoczne dla uczestników są po polsku.
- Narzędzia nie ujawniają panelu `/admin` ani wewnętrznego katalogu kontrolowanych błędów.
- Zmiany w aplikacji mogą dotyczyć stabilności formularzy, API, danych syntetycznych, historii i `correlationId`, ale nie gotowych implementacji narzędzi.

## Dowody weryfikacji

Ten obszar nie będzie miał PR-ów narzędziowych w repozytorium. Weryfikacja aplikacji pozostaje w etapach implementacji Kliniki Debug, a weryfikacja narzędzi powstałych na warsztacie odbywa się lokalnie, poza repozytorium.
