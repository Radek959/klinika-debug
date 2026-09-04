# Klinika Debug

Klinika Debug to demonstracyjna aplikacja do obsługi zleceń badań laboratoryjnych, przygotowywana na potrzeby warsztatu **Tester z AI**.

Aplikacja umożliwia przejście procesu:

> pacjent → zlecenie badań → rejestracja próbek → wysłanie do laboratorium → oczekiwanie → wynik lub błąd

## Najważniejsze założenia

- interfejs użytkownika jest w języku polskim;
- techniczne nazwy endpointów, pól API, kodów błędów i wartości enum są w języku angielskim;
- aplikacja udostępnia interfejs webowy, REST API i dokumentację OpenAPI;
- dane poszczególnych placówek są odseparowane;
- laboratorium działa asynchronicznie i jest obsługiwane przez symulator;
- zachowanie środowiska może być globalnie zmieniane z panelu technicznego `/admin`;
- wszystkie dane są syntetyczne.

System służy wyłącznie do demonstracji i nauki testowania. Nie wolno używać w nim prawdziwych danych pacjentów ani wykorzystywać wyników do podejmowania decyzji medycznych.

## Dokumentacja

- [Dokumentacja produktowa](docs/dokumentacja-produktowa.md)
- [Specyfikacja MVP](docs/specyfikacja-mvp.md)
- [Architektura techniczna](docs/architektura-techniczna.md)

## Status

Projekt jest w fazie akceptacji architektury technicznej i przygotowania szkieletu MVP.
