# Etap 8 — narzędzia warsztatowe

**Status etapu:** `PLANNED`

## Zakres

Etap obejmuje narzędzia pomocnicze dla warsztatu, które korzystają z Kliniki Debug, ale nie są częścią głównego MVP aplikacji.

Planowane kierunki:

- rozszerzenie Chrome „Klinika Data Helper” do generowania syntetycznych danych pacjentów;
- lokalne narzędzie „Correlation Inspector” do analizy logów po `correlationId`;
- bezpieczne skrypty API używane w ćwiczeniach;
- materiały wspierające testowanie bez ujawniania sekretów i wewnętrznego katalogu błędów.

## Stan na `main`

Nie widać jeszcze implementacji narzędzi warsztatowych. Etap pozostaje zaplanowany.

## Zasady realizacji

- Narzędzia mają używać wyłącznie danych syntetycznych.
- Narzędzia nie zapisują haseł, tokenów ani sekretów w kodzie lub wynikach.
- Interfejsy narzędzi widoczne dla uczestników są po polsku.
- Zakres narzędzi nie powinien rozszerzać MVP Kliniki Debug.
- Narzędzia nie ujawniają panelu `/admin` ani wewnętrznego katalogu kontrolowanych błędów.

## Dowody weryfikacji

Do uzupełnienia w PR-ach narzędziowych: instrukcja uruchomienia, testy lokalne, wyniki sprawdzenia danych syntetycznych i bezpieczeństwa.
