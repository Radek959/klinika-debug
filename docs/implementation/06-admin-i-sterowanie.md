# Etap 6 — admin i sterowanie

**Status etapu:** `SUPERSEDED` przez Workshop MVP  
**Status historyczny:** pierwotnie `PLANNED`  
**Aktualne źródło prawdy:** [`workshop-mvp.md`](workshop-mvp.md)

## Decyzja

Pierwotny Etap 6 zakładał pełny panel administracyjny. Na potrzeby szkolenia jest to nadmiarowy zakres.

Nie implementujemy rozbudowanego systemu admina. Zastępuje go minimalny **Trainer Panel** pod `/admin`.

## Wymagany zakres Workshop MVP

Panel prowadzącego ma pozwalać na:

- odczyt i zmianę globalnego scenariusza laboratorium;
- odczyt i zmianę `CLEAN` / jednego kontrolowanego defektu;
- reset danych warsztatowych do znanego stanu;
- proste potwierdzenie aktualnej konfiguracji.

Dostęp jest oddzielony od kont `STAFF`, a panel nie jest widoczny w nawigacji uczestnika.

## Świadomie poza Workshop MVP

Nie implementujemy przed szkoleniem:

- dashboardu stanu aplikacji i bazy;
- rozbudowanego RBAC;
- CRUD kont uczestników;
- rozbudowanego audytu zmian;
- historii konfiguracji;
- monitoringu infrastruktury;
- konfiguracji per workspace;
- zaawansowanego UX panelu.

Provisioning uczestników odbywa się skryptem/seedem, nie przez UI.

Szczegóły techniczne: `docs/architektura-techniczna.md` i `docs/specyfikacja-mvp.md`.
