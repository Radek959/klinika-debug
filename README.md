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
- [Plan implementacji](docs/implementation/README.md)

## Lokalne uruchomienie

Wymagania:

- Node.js 22 LTS;
- npm;
- MySQL 8 lokalnie albo Docker z Compose.

Kroki:

```powershell
npm install
Copy-Item .env.example .env
docker compose up -d mysql mysql-test
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api
```

Frontend w trybie developerskim można uruchomić w drugim terminalu:

```powershell
npm run dev:web
```

Domyślne syntetyczne konto lokalne:

- login: `staff.demo`
- hasło: `HasloTestowe123!`

W produkcji seed wymaga jawnego `SEED_STAFF_PASSWORD`. Lokalna wartość domyślna działa tylko poza `NODE_ENV=production`.

## Hostinger

Konfiguracja dla frameworka `Other`:

```powershell
Package manager: npm
Output directory: ./
Entry file: apps/api/dist/main.js
```

Build command dla pierwszego wdrożenia:

```powershell
npm run build:hostinger:seed
```

Build command dla kolejnych wdrożeń:

```powershell
npm run build:hostinger
```

`build:hostinger` wykonuje `prisma generate`, build aplikacji i `prisma migrate deploy` — nigdy nie tworzy ani nie resetuje żadnych kont czy danych.

`build:hostinger:seed` dodatkowo uruchamia `db:seed` (konto demo `staff.demo` / workspace `klinika-pokazowa`) i `workshop:prepare` (konta `testerNN` / workspace'y `warsztat-NN`). Oba kroki są w pełni idempotentne (`upsert`, bez nadpisywania danych uczestników przy powtórnym uruchomieniu) — bezpiecznie jest ustawić `build:hostinger:seed` jako **stały** Build command, jeśli panel hostingowy nie pozwala na wpisanie własnej komendy (np. Hostinger hPanel udostępnia tylko zamkniętą listę opcji). Wymaga ustawienia `SEED_STAFF_PASSWORD` i `WORKSHOP_STAFF_PASSWORD` w środowisku produkcyjnym.

Jeśli panel budowania pozwala wpisać dowolną komendę, można zamiast tego użyć rozdzielonych opcji poniżej (`build:hostinger` na co dzień, `build:hostinger:workshop` świadomie przed szkoleniem) — to nadal jest preferowany, bardziej jawny podział. `build:hostinger:seed` z `workshop:prepare` w środku istnieje jako bezpieczny wariant dla platform z ograniczonym wyborem Build command, nie jako zmiana domyślnego zachowania zwykłego `build:hostinger`.

## Przygotowanie środowiska warsztatowego

Przygotowanie środowiska przed szkoleniem jest osobną, jawną operacją — nie częścią standardowego deploymentu.

```powershell
npm run build:hostinger:workshop
```

wykonuje kolejno: `build:hostinger` (build + `prisma migrate deploy`), a następnie `npm run workshop:prepare`.

`workshop:prepare` można też uruchomić samodzielnie (np. po zwykłym `build:hostinger`):

```powershell
npm run workshop:prepare
```

Skrypt:

- czyta liczbę uczestników z `WORKSHOP_PARTICIPANTS` (domyślnie 15);
- sprawdza wymaganą konfigurację (`ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `DATABASE_URL`, a w produkcji także `WORKSHOP_STAFF_PASSWORD`);
- korzysta z istniejącego, jedynego mechanizmu provisioningu (`provisionWorkshopWorkspaces`) — tego samego, co `npm run workshop:seed`;
- jest idempotentny i **nigdy nie resetuje** istniejących danych uczestników;
- nie wypisuje żadnych haseł, hashy, tokenów ani sekretów.

Wymagane zmienne środowiskowe (patrz `.env.example`):

```text
WORKSHOP_PARTICIPANTS=15
WORKSHOP_STAFF_PASSWORD=...
ADMIN_PASSWORD_HASH=...
ADMIN_SESSION_SECRET=...
```

### Proces przed szkoleniem

```text
1. deploy aplikacji (build:hostinger albo build:hostinger:workshop)
2. npm run workshop:prepare  (jeśli nie użyto build:hostinger:workshop)
3. npm run workshop:smoke   (przeciwko wdrożonemu środowisku, patrz niżej)
4. sprawdź /admin
5. zresetuj środowisko (npm run workshop:reset albo reset w /admin) tuż przed wejściem uczestników
```

## Smoke test wdrożonego środowiska

`npm run workshop:smoke` uruchamia automatyczny smoke test przeciwko RZECZYWIŚCIE WDROŻONEJ Klinice Debug, odzwierciedlający główny przebieg warsztatu (health, logowanie do `/admin`, logowanie uczestników, izolacja workspace'ów, ścieżka pacjent → zlecenie → próbka → laboratorium → wynik, kontrolowane błędy, OpenAPI, fixture'y logów).

Konfiguracja:

```text
WORKSHOP_BASE_URL=https://klinikadebug.rwasik.pl
WORKSHOP_STAFF_PASSWORD=...
WORKSHOP_ADMIN_PASSWORD=...
```

`WORKSHOP_ADMIN_PASSWORD` jest sekretem WYŁĄCZNIE tego runnera (jawne hasło panelu `/admin`, odpowiadające hashowi w `ADMIN_PASSWORD_HASH`) — nigdy nie trafia do repo ani logów.

Bez jawnego potwierdzenia smoke wykonuje wyłącznie read-only preflight (health, odczyt konfiguracji `/admin`, OpenAPI, fixture'y logów) i nie zmienia żadnych danych:

```powershell
npm run workshop:smoke
```

Pełny smoke (logowanie uczestników, reset, główna ścieżka, kontrolowane błędy) wymaga jawnego potwierdzenia:

```powershell
WORKSHOP_SMOKE_CONFIRM=RUN npm run workshop:smoke
```

Smoke drukuje host przed startem, nigdy nie loguje haseł/tokenów/cookies, na końcu (także po błędzie w trakcie testu) próbuje przywrócić `SUCCESS` + `CLEAN` i zresetować środowisko, oraz kończy się kodem `0` (PASS) albo `1` (co najmniej jeden krok FAIL).

Testy samego runnera (bez sieci, mock HTTP server): `npm run test:workshop-smoke`.

Pełny techniczny runbook przygotowania warsztatu (audit zgodności ze szkoleniem, checklisty, recovery, emergency clean state): [`docs/warsztat/workshop-readiness.md`](docs/warsztat/workshop-readiness.md).

## Lokalne browser smoke tests (Playwright) — obowiązkowa bramka przed PR-em

`npm run test:workshop-browser` (albo zbiorczo `npm run verify:pr`) uruchamia mały suite Playwright — lokalne browser smoke tests uruchamiane przed utworzeniem PR-a (AGENTS.md), chroniący flow testowane manualnie przed warsztatem (logowanie, dashboard, pacjent → zlecenie, próbki → laboratorium → wynik, Materiały/dokumentacja/log, investigation z `correlationId`). Suite:

- jest OBOWIĄZKOWĄ LOKALNĄ bramką przed każdym PR-em;
- NIE jest wymaganym checkiem GitHub Actions i NIE jest uruchamiany w CI;
- NIE jest uruchamiany przeciwko Hostingerowi ani żadnemu innemu publicznemu hostowi — działa wyłącznie przeciwko lokalnemu środowisku Kliniki Debug (`WORKSHOP_BASE_URL` musi wskazywać `localhost`/`127.0.0.1`/`::1`, inaczej suite kończy się jasnym błędem przed wysłaniem jakiegokolwiek requestu).

Wymaga lokalnego, production-like środowiska, pod którym dostępne są jednocześnie frontend, `/api`, `/admin` i `/materials` — najprościej przez istniejący lokalny build:

```powershell
npm run build
npm run db:migrate
npm start
```

Konfiguracja — te same trzy zmienne co `workshop:smoke`, plus jawne potwierdzenie (suite zawsze tworzy dane i resetuje środowisko):

```text
WORKSHOP_BASE_URL=http://localhost:3000
WORKSHOP_STAFF_PASSWORD=...
WORKSHOP_ADMIN_PASSWORD=...
WORKSHOP_E2E_CONFIRM=RUN
```

```powershell
WORKSHOP_E2E_CONFIRM=RUN npm run test:workshop-browser
```

Suite jest serial (globalny config `/admin` nie nadaje się do równoległych testów). Setup: resetuje środowisko, a DOPIERO POTEM ustawia `SUCCESS` + `CLEAN` + `labDelay=5s` (reset przywraca domyślne 5 minut, więc konfiguracja testowa musi nastąpić po resecie) i sprawdza, że `/admin/api/config` rzeczywiście to potwierdza. Cleanup: reset, a potem `SUCCESS` + `CLEAN` + `labDelay=5min` — jeśli sprzątanie się nie powiedzie, suite jasno kończy się komunikatem „Środowisko wymaga ręcznego resetu.”. Przy niepowodzeniu zapisuje zrzut ekranu i trace (`retain-on-failure`); artefakty nie są commitowane.

## Testy i build

Podstawowe bramki:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Testy integracyjne API wymagają oddzielnej bazy MySQL wskazanej przez `TEST_DATABASE_URL`.
Skrypt automatycznie przekazuje ją do Prisma jako `DATABASE_URL`, żeby testy nie użyły bazy developerskiej.

```powershell
$env:TEST_DATABASE_URL = "mysql://klinika:klinika_local_password@localhost:3307/klinika_debug_test"
npm run db:migrate:test
npm run test:integration
```

Smoke test produkcyjnego startu wymaga wcześniejszego buildu i tej samej testowej bazy:

```powershell
npm run build
$env:TEST_DATABASE_URL = "mysql://klinika:klinika_local_password@localhost:3307/klinika_debug_test"
npm run test:production-start
```

Jeżeli lokalnie nie ma MySQL albo Dockera, testy integracyjne i smoke test produkcyjny uruchamia workflow GitHub Actions z usługą MySQL.

Obowiązkowa lokalna bramka przed KAŻDYM PR-em (lint, typecheck, testy, build i lokalny Playwright — patrz sekcja wyżej):

```powershell
npm run verify:pr
```

`verify:pr` NIE jest uruchamiane w CI — to niezależna, lokalna bramka developera/agenta.

## Status

Projekt ma działający fundament aplikacji i deploymentu: monorepo npm workspaces, React + Vite, NestJS + Fastify, Prisma + MySQL, healthchecki, OpenAPI, konfigurację builda pod Hostinger oraz podstawowe bramki jakości.

Na `main` istnieją już między innymi: logowanie i sesje, izolacja workspace'ów, obsługa pacjentów, katalog badań, tworzenie zleceń, lista i szczegóły zleceń, rejestracja próbek, wysyłka do laboratorium, trwała kolejka zadań w MySQL, scheduler, callback z wynikami oraz prezentacja wyników w UI.

Nie cały zakres MVP jest ukończony. Aktualny stan etapów, statusy i rekomendowany następny PR są opisane w [planie implementacji](docs/implementation/README.md).
