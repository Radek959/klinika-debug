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

`build:hostinger` wykonuje `prisma generate`, build aplikacji i `prisma migrate deploy`. `build:hostinger:seed` dodatkowo uruchamia seed i jest przeznaczony wyłącznie do pierwszego wdrożenia. Przy seedowaniu produkcyjnym wymagane jest ustawienie `SEED_STAFF_PASSWORD`.

`build:hostinger` NIE przygotowuje środowiska warsztatowego (uczestników `warsztat-NN` / `testerNN`) i nie robi tego automatycznie przy żadnym deployu w trakcie trwania szkolenia — to świadomy wybór, żeby zwykły deploy nigdy nie modyfikował danych uczestników.

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
3. preflight/smoke wdrożonego środowiska
4. sprawdź /admin
5. zresetuj środowisko (npm run workshop:reset albo reset w /admin) tuż przed wejściem uczestników
```

Krok 3 (automatyczny smoke przeciwko wdrożonemu środowisku) opisuje osobny dokument techniczny warsztatu.

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

## Status

Projekt ma działający fundament aplikacji i deploymentu: monorepo npm workspaces, React + Vite, NestJS + Fastify, Prisma + MySQL, healthchecki, OpenAPI, konfigurację builda pod Hostinger oraz podstawowe bramki jakości.

Na `main` istnieją już między innymi: logowanie i sesje, izolacja workspace'ów, obsługa pacjentów, katalog badań, tworzenie zleceń, lista i szczegóły zleceń, rejestracja próbek, wysyłka do laboratorium, trwała kolejka zadań w MySQL, scheduler, callback z wynikami oraz prezentacja wyników w UI.

Nie cały zakres MVP jest ukończony. Aktualny stan etapów, statusy i rekomendowany następny PR są opisane w [planie implementacji](docs/implementation/README.md).
