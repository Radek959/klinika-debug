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
10. Przygotuj opis PR-a z zakresem, elementem planu i dowodami weryfikacji.

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
