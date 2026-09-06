# Etap 7 — kontrolowane błędy

**Status etapu:** `PLANNED`

## Zakres

- globalny mechanizm pakietów błędów;
- domyślny tryb `CLEAN`;
- maksymalnie jeden aktywny pakiet błędów;
- jawne strategie lub przełączniki w wyznaczonych warstwach;
- wewnętrzny katalog błędów;
- początkowe pakiety: `PATIENT_DATA`, `ORDER_FLOW`, `LAB_INTEGRATION`, `LOGS`, `PERFORMANCE`;
- testy potwierdzające przywrócenie poprawnego zachowania po wyłączeniu pakietu.

## Stan na `main`

Nie widać jeszcze mechanizmu globalnych pakietów błędów ani wewnętrznego katalogu defektów. Etap pozostaje zaplanowany.

## Zasady realizacji

- Celowe błędy nie mogą być mieszane z przypadkowymi regresjami.
- Każdy błąd musi być deterministyczny, opisany i możliwy do wyłączenia.
- Pakiety błędów nie mogą zależeć od pojedynczego konta lub workspace'u.
- Tryby symulatora laboratorium są poprawnymi scenariuszami biznesowymi, a nie pakietami defektów.
- Katalog błędów nie jest dokumentacją produktową i nie jest ujawniany uczestnikom.

## Dowody weryfikacji

Do uzupełnienia w PR-ach implementacyjnych: testy trybu `CLEAN`, testy aktywacji i dezaktywacji pakietów, wyniki CI.
