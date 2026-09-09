# Feature delivery playbook

## Kiedy używać

Użyj tego playbooka przy realizacji kompletnego zadania, funkcji albo PR-a, niezależnie od tego, czy zmiana dotyczy frontendu, backendu, dokumentacji czy procesu.

## Kolejność pracy

1. Przeczytaj dokumentację: `AGENTS.md`, dokumentację produktową, specyfikację MVP i architekturę.
2. Sprawdź aktualny plan w `docs/implementation/README.md` oraz właściwy plan etapu.
3. Potwierdź zakres: co jest celem PR-a, a co zostaje poza zakresem.
4. Obejrzyj istniejący kod, testy i historię ostatnich merge'y.
5. Zaimplementuj najmniejszy spójny fragment działający przez potrzebne warstwy.
6. Zaktualizuj albo dodaj testy adekwatne do ryzyka.
7. Uruchom wymagane bramki jakości i zapisz dokładne komendy.
8. Zaktualizuj dokumentację, jeśli zmienia się zachowanie produktu, API, proces albo status planu.
9. Zaktualizuj status planu zgodnie z Definition of Done.
10. Przed utworzeniem PR-a uruchom lokalną bramkę `npm run verify:pr` (patrz niżej).
11. Przygotuj opis PR-a z zakresem, elementem planu i dowodami weryfikacji.

## `npm run verify:pr` — obowiązkowa lokalna bramka przed PR-em

Definition of Done dla każdego PR-a obejmuje lokalne uruchomienie `npm run verify:pr` (lint, typecheck, testy, build i lokalny Playwright — `npm run test:workshop-browser`) PRZED utworzeniem PR-a.

- PR nie powinien zostać utworzony, jeśli ta bramka nie przeszła.
- `npm run verify:pr` obejmuje Playwright, ale WYŁĄCZNIE przeciwko lokalnemu środowisku Kliniki Debug (patrz `AGENTS.md`, README) — nigdy przeciwko CI ani przeciwko Hostingerowi. Adres jest `WORKSHOP_BROWSER_BASE_URL` (opcjonalny, domyślnie `http://localhost:3000`) — NIGDY `WORKSHOP_BASE_URL` (ta zmienna jest wyłącznie dla `workshop:smoke`).
- Bez `WORKSHOP_E2E_CONFIRM=RUN` `npm run test:workshop-browser` kończy się błędem, a nie "skipped" — to NIE jest przejście bramki.
- Jeżeli Playwright nie może wystartować z powodu ograniczeń lokalnego środowiska (np. brak możliwości uruchomienia bazy albo pełnego stacka), NIE uznawaj tego kroku za PASS. Opisz blokadę wprost w opisie PR-a (np. „Local Playwright: NOT RUN — lokalne środowisko full-stack niedostępne”).
- Nie zastępuj lokalnego Playwrighta wynikiem CI — CI nie uruchamia tego suite'u.

## Zakazy

- Nie rozszerzaj zakresu bez potrzeby i bez decyzji.
- Nie implementuj elementów przyszłych etapów bez wyraźnego polecenia.
- Nie oznaczaj testów jako wykonanych bez ich uruchomienia.
- Nie oznaczaj statusu `VERIFIED` bez wyniku testów, CI i review.
- Nie oznaczaj statusu `DEPLOYED` bez sprawdzenia środowiska.
- Nie ukrywaj niepowodzeń testów; opisz dokładnie wynik i przyczynę.
- Nie używaj `npm audit fix --force`.
- Nie modyfikuj przypadkowo cudzych, niezwiązanych zmian.
- Nie dodawaj sekretów ani prawdziwych danych pacjenta.

## Checklista PR-a

- Cel i zakres są jasne.
- Element planu implementacji jest wskazany.
- Zmiany poza zakresem są wymienione albo oznaczone jako brak.
- Dokumentacja została zaktualizowana, jeśli było to potrzebne.
- Testy i komendy są zapisane z wynikiem.
- CI jest wskazane, jeśli było dostępne.
- Status wdrożenia jest zgodny z faktycznym stanem.
- UI pozostaje po polsku.
- Dane są syntetyczne.
- `npm run verify:pr` zostało uruchomione lokalnie z wynikiem PASS, albo opisano jawnie blokadę (np. brak możliwości uruchomienia lokalnego Playwrighta w danym środowisku).
