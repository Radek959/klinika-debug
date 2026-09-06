# Frontend playbook

## Kiedy używać

Użyj tego playbooka przy każdej zmianie w `apps/web`, widokach, formularzach, nawigacji, komunikatach, mapowaniu etykiet lub testach UI.

## Zasady

- Stos technologiczny: React, Vite i TypeScript.
- Korzystaj ze współdzielonych kontraktów z `packages/api-contracts`; nie duplikuj ręcznie kształtu API.
- Interfejs jest wyłącznie po polsku: etykiety, przyciski, walidacje, błędy, potwierdzenia, filtry i puste stany.
- Techniczne enumy pokazuj przez polskie etykiety ze współdzielonego słownika UI.
- Użytkownik nie powinien ręcznie wpisywać technicznych identyfikatorów, jeśli może wybrać zasób po zrozumiałych danych.
- Formularze i akcje muszą działać klawiaturą, mieć poprawne etykiety, fokus i ARIA tam, gdzie są potrzebne.
- Każdy widok danych obsługuje stany: loading, empty, error, retry i success.
- Widoki mają być responsywne dla laptopa i typowego monitora; telefon nie jest osobną aplikacją, ale układ nie może się rozsypywać.
- Preferuj style komponentowe i lokalne klasy zamiast szerokich reguł globalnych.
- Chroń widoki przed race conditions i starymi odpowiedziami requestów, np. przez `AbortController`, ignorowanie nieaktualnych odpowiedzi albo kontrolę aktywnego requestu.
- Daty formatuj bezpiecznie i konsekwentnie, z uwzględnieniem prezentacji czasu użytkownika.
- Nie pokazuj panelu `/admin`, aktywnego pakietu błędów ani wewnętrznych materiałów warsztatowych w interfejsie uczestnika.

## Checklista

- Czy widok korzysta z kontraktów API zamiast lokalnych kopii typów?
- Czy cały tekst widoczny dla użytkownika jest po polsku?
- Czy techniczne statusy i enumy mają polskie etykiety?
- Czy użytkownik wybiera pacjenta, badanie albo zlecenie po danych zrozumiałych, a nie po surowym ID?
- Czy formularz ma walidację, komunikaty błędów i zachowanie po sukcesie?
- Czy są stany loading, empty, error, retry i success?
- Czy interakcje działają klawiaturą i mają sensowny fokus?
- Czy układ jest responsywny i tekst nie nachodzi na inne elementy?
- Czy requesty nie nadpisują ekranu przestarzałą odpowiedzią?
- Czy testy Vitest i Testing Library pokrywają główne zachowania oraz błędy?
- Czy zmiana jest zgodna z dokumentacją produktową, specyfikacją MVP i aktywnym planem?
