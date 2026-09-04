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

## Lokalne uruchomienie Etapu 1

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

Domyślne syntetyczne konto Etapu 1:

- login: `staff.demo`
- hasło: `HasloTestowe123!`

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

## Status

Projekt ma szkielet Etapu 1: monorepo npm workspaces, React + Vite, NestJS + Fastify, Prisma + MySQL, logowanie, sesje, healthchecki, OpenAPI i podstawowe testy.
