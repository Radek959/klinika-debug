# Plan implementacji Kliniki Debug

## Cel katalogu

Ten katalog opisuje realizację **Workshop MVP**: minimalnego, stabilnego zakresu potrzebnego do około 6-godzinnego warsztatu „Tester z AI”. Klinika Debug jest środowiskiem do ćwiczeń, a nie pełnym produktem SaaS.

Dokumentacja produktowa opisuje wymagania i zachowanie aplikacji. Katalog `docs/implementation` opisuje, co jest potrzebne do warsztatu, co zostało zaimplementowane oraz co świadomie pozostaje poza zakresem.

### Hierarchia źródeł prawdy dla dalszego developmentu

1. [`docs/warsztat/przebieg-szkolenia.md`](../warsztat/przebieg-szkolenia.md) — czego rzeczywiście potrzebuje szkolenie;
2. [`workshop-mvp.md`](workshop-mvp.md) — zakres pozostałej implementacji;
3. [`../dokumentacja-produktowa.md`](../dokumentacja-produktowa.md) — poprawne zachowanie widoczne dla uczestnika;
4. [`../specyfikacja-mvp.md`](../specyfikacja-mvp.md) — wymagania Workshop MVP;
5. [`../architektura-techniczna.md`](../architektura-techniczna.md) — kierunek techniczny.

Starsze plany etapów są dokumentacją historyczną i nie mogą samodzielnie rozszerzać zakresu Workshop MVP.

## Aktualny etap prac

Etapy 1–4 tworzą gotowy rdzeń warsztatowy:

- fundament, sesje i izolacja workspace'ów;
- pacjenci;
- zlecenia, próbki i historia operacji;
- REST API i OpenAPI;
- symulator laboratorium;
- scenariusze `SUCCESS`, `PARTIAL_SUCCESS`, `SAMPLE_REJECTED`, `VALIDATION_ERROR`, `RATE_LIMIT`, `SERVER_ERROR`, `TIMEOUT`;
- pełne retry 15/30/60 s i `TECHNICAL_ERROR` po wyczerpaniu prób.

Nie rozwijamy dalej Etapów 1–4 bez konkretnej potrzeby warsztatowej.

Rekomendowany następny zakres: **Workshop MVP — izolowane workspace'y uczestników, minimalne sterowanie prowadzącego, 2–3 kontrolowane błędy, realistyczne syntetyczne logi i workshop readiness**.

Development Workshop MVP jest zakończony: wszystkie zakresy z tabeli poniżej mają status `IMPLEMENTED`. Pozostałe kroki do `VERIFIED`/`DEPLOYED` (rzeczywisty remote smoke, testy integracyjne na realnej bazie, weryfikacja CI, deployment) są opisane w `docs/warsztat/workshop-readiness.md`. Kolejny development Kliniki Debug wymaga nowej, wyraźnej potrzeby warsztatowej — nie jest kontynuowany automatycznie.

## Granice narzędzi warsztatowych

Skrypt Python, rozszerzenie Chrome i lokalne narzędzia analityczne są tworzone podczas warsztatu przy pomocy AI albo pozostają lokalnymi artefaktami prowadzącego i uczestników. Nie są implementowane jako część aplikacji w tym repozytorium.

Notatki prowadzącego powstaną osobno na podstawie finalnej wersji produktu.

## Izolacja uczestników

Domyślny model warsztatu:

**1 uczestnik = 1 workspace + 1 konto STAFF.**

Jeżeli uczestnicy pracują parami, dopuszczalne jest 1 workspace na parę.

Osobne konta w tym samym workspace nie zapewniają niezależnych danych — pacjenci, zlecenia i inne zasoby są izolowane po `workspaceId`.

## Status zakresów

| Zakres | Status | Stan na `main` / decyzja |
|---|---|---|
| Etap 1 — fundament | `IMPLEMENTED` | Fundament aplikacji, deploymentu, sesji, workspace'ów, OpenAPI i testów jest obecny. |
| Etap 2 — pacjenci | `IMPLEMENTED` | Podstawowa obsługa pacjentów w API i UI jest obecna. |
| Etap 3 — zlecenia i próbki | `IMPLEMENTED` | Zlecenia, katalog badań, próbki, edycja `DRAFT` i historia operacji są zaimplementowane. |
| Etap 4 — laboratorium | `IMPLEMENTED` | Wysyłka, callbacki, retry i wszystkie potrzebne scenariusze laboratoryjne są zaimplementowane. |
| Workshop MVP — uczestnicy | `IMPLEMENTED` | Provisioning (`npm run workshop:seed -- --participants=N`) tworzy deterministyczne workspace'y `warsztat-NN` z kontami `testerNN` (STAFF) i danymi startowymi; `npm run workshop:reset` przywraca dane wyłącznie tych workspace'ów do stanu początkowego. Każdy workspace jest izolowany po `workspaceId` (jeden uczestnik = jeden workspace + jedno konto `STAFF`). |
| Workshop MVP — trainer controls | `IMPLEMENTED` | Panel `/admin` (samodzielna strona HTML serwowana przez `AdminViewController`, poza SPA i poza nawigacją uczestnika), z logicznym podziałem na sekcje: aktualna konfiguracja (badge/summary scenariusza, defektu i czasu wyników, aktualizowane po każdym zapisie/presecie/resecie), szybkie ustawienia (maks. 4 gotowe presety `labScenario`+`controlledBug`+`labDelayMs`, zapisywane od razu przez istniejący `PUT /admin/api/config`, bez osobnego backendu presetów), konfiguracja ręczna (wybór scenariusza laboratorium i kontrolowanego błędu z dynamicznym, widocznym opisem pod każdym selectem — treść zmienia się natychmiast po zmianie selecta, jeszcze przed zapisem), reset uczestnika (reset danych JEDNEGO workspace'u warsztatowego z jawnym potwierdzeniem) i reset całego środowiska (istniejący `resetWorkshopWorkspaces(...)` z jawnym potwierdzeniem). Reset jednego uczestnika korzysta z nowej funkcji `resetSingleWorkshopWorkspace(...)` (`apps/api/src/common/prisma/reset-workshop.ts`, współdzieli transakcję z resetem całościowym) przez `POST /admin/api/workspaces/:slug/reset` — unieważnia tylko sesję tego uczestnika i nie zmienia globalnej konfiguracji. Lista uczestników do wyboru pochodzi z admin-only `GET /admin/api/workspaces` (`apps/api/src/common/prisma/list-workshop-workspaces.ts`) — zwraca wyłącznie `slug`/`name`/`login`, bez danych pacjentów, haszy czy sesji. Globalna, jednowierszowa konfiguracja (`WorkshopConfigService`, tabela `workshop_config`, migracja `20260908090000_workshop_config`) jest trwała i CELOWO nie jest cache'owana w procesie API — każdy odczyt (`getConfig`) czyta wprost z bazy, żeby globalny reset wykonany z osobnego procesu CLI (`npm run workshop:reset`) był natychmiast widoczny w już uruchomionym API, bez restartu; nowa wysyłka do laboratorium czyta bieżący scenariusz stąd, a automatyczne ponowienie nadal używa scenariusza zapisanego w chwili utworzenia zadania. Globalny reset (`resetWorkshopWorkspaces` w `apps/api/src/common/prisma/reset-workshop.ts`) przywraca tę konfigurację do `SUCCESS`/`CLEAN`/`300000` jako część tej samej transakcji co reset workspace'ów — to jedyne, współdzielone źródło logiki resetu, wywoływane zarówno przez `POST /admin/api/reset` jak i `npm run workshop:reset`, więc oba sposoby resetu środowiska są w pełni równoważne. `LAB_SIMULATOR_SCENARIO` pozostaje tylko jako wartość startowa (bootstrap) dla świeżo zmigrowanej bazy. Uwierzytelnienie panelu jest osobne od sesji STAFF: `ADMIN_PASSWORD_HASH` (argon2id) + `ADMIN_SESSION_SECRET` (podpisane, bezstanowe ciasteczko HttpOnly/SameSite=Strict/Secure w produkcji, TTL 2h), bez nowej tabeli kont ani RBAC. API panelu (`/admin/api/*`, w tym nowe `workspaces` i `workspaces/:slug/reset`) jest wyłączone z `/api/v1` i z publicznego OpenAPI (`@ApiExcludeController`). Testy: `apps/api/src/workshop-config/workshop-config.service.spec.ts`, `apps/api/src/admin/admin-session.service.spec.ts`, `apps/api/src/config/env.validation.spec.ts`, `apps/api/test/admin.e2e-spec.ts` (w tym reset jednego uczestnika, izolacja pozostałych workspace'ów i lista `GET /admin/api/workspaces`), `scripts/test-workshop-config-migration.cjs` (`npm run test:migration:workshop-config`, uruchamiany w `.github/workflows/ci.yml`). |
| Workshop MVP — controlled bugs | `IMPLEMENTED` | Trzy deterministyczne defekty aktywowane wyłącznie przez `controlledBug` w panelu `/admin` (`apps/api/src/workshop-config/controlled-bug.ts`), co najwyżej jeden naraz: `PATIENT_GUARDIAN` (wyłącza wyłącznie regułę `GUARDIAN_REQUIRED` w `packages/domain/src/patients/patient-write.ts`), `ORDER_FLOW` (błędne przejście do `SAMPLE_COLLECTED` po pierwszej z 2+ wymaganych próbek, `packages/domain/src/orders/sample-collection.ts`), `API_DIAGNOSTICS` (kontrolowany HTTP 500 na `POST /api/v1/orders/{orderId}/send` dla zlecenia ze zleceniem TSH, przed wywołaniem laboratorium, bez efektów ubocznych integracji). Każde miejsce oznaczone komentarzem `WORKSHOP CONTROLLED DEFECT`. Testy: `apps/api/src/patients/patient-write-domain.spec.ts`, `packages/domain/src/orders/sample-collection.spec.ts`, `apps/api/test/workshop-controlled-bugs.e2e-spec.ts`. |
| Workshop MVP — log fixtures | `IMPLEMENTED` | Siedem statycznych fixture'ów JSONL w `workshop-assets/logs/` (happy-path, patient-error, order-flow, lab-timeout, api-diagnostics, correlation-trace, production-like), wszystkie powyżej wymaganego minimum wpisów, generowane deterministycznie przez `scripts/generate-workshop-logs.cjs` (`npm run generate:workshop-logs`) na podstawie rzeczywistych endpointów, kodów błędów i harmonogramu retry 15/30/60 s. Automatyczny walidator `scripts/validate-workshop-logs.cjs` (`npm run test:workshop-logs`) jest częścią `npm test`/CI. Statyczne fixture'y, nie nowy podsystem observability. |
| Workshop MVP — readiness | `IMPLEMENTED` | `npm run workshop:prepare` (przygotowanie środowiska bez resetu danych), `npm run workshop:smoke` (automatyczny smoke test wdrożonego środowiska) i techniczny runbook `docs/warsztat/workshop-readiness.md` (audit zgodności ze szkoleniem, checklisty, recovery) są gotowe. Aktualne CI wykonuje i przechodzi testy migracji testowej bazy, `npm run check`, `npm run test:integration`, build produkcyjny i `npm run test:production-start` — pozwala to uznać warstwę kodową za `VERIFIED` (patrz `docs/warsztat/workshop-readiness.md`, sekcja 7). Rzeczywisty deployment na Hostinger, remote smoke przeciwko wdrożonemu środowisku, manualny UI smoke i finalny reset przed szkoleniem NIE zostały tu wykonane, więc status wdrożonego środowiska pozostaje `IMPLEMENTED`, nie `DEPLOYED`. |
| Workshop MVP — log browser (UI) | `IMPLEMENTED` | Uczestnik ogląda i pobiera fixture'y `workshop-assets/logs/*.log` bezpośrednio w aplikacji (**Materiały**, `/materials`), bez GitHuba, VS Code ani terminala. Jedno źródło metadanych frontendu (`apps/web/src/materials/workshopLogs.ts`) mapuje neutralny `id` (bez `PATIENT_GUARDIAN`/`ORDER_FLOW`/`API_DIAGNOSTICS` ani nazwy `api-diagnostics.log` na liście) na plik z whitelisty; `/materials/logs/:logId` rozstrzyga `logId` WYŁĄCZNIE przez tę whitelistę, nigdy przez bezpośrednie zbudowanie ścieżki z parametru trasy. Podgląd to zwykły `fetch + text()` w `<pre>` (monospace, zaznaczalny tekst, Ctrl+F, scroll pionowy/poziomy) — bez parsera JSONL, kolorowania, virtual scroll ani paginacji. Pobranie to statyczny link `<a download>` do skopiowanego fixture'u, bez osobnego endpointu API. Build-time: `scripts/copy-workshop-logs-web.cjs` (`apps/web` `prebuild`/`predev`) kopiuje WYŁĄCZNIE jawną whitelistę plików z `workshop-assets/logs/` do `apps/web/public/materials/logs/` → `dist/materials/logs/*.log`; brak wymaganego pliku rzuca błąd i zatrzymuje build. `workshop-assets/logs/` pozostaje jedynym źródłem prawdy treści logów — katalog docelowy jest gitignorowany (`*.log`) i odtwarzany przy każdym buildzie. Testy: `apps/web/src/materials/MaterialsUi.test.tsx` (nawigacja, lista, podgląd loading/success/error, bezpieczny ekran dla nieznanego `logId`), `scripts/workshop-logs-web-copy.test.cjs` (`npm run test:workshop-logs-web-copy`, część `npm test`). `npm run workshop:smoke` ma dodatkowy read-only krok „Materials asset” sprawdzający HTTP 200 dla jednego fixture'u po deployu. Brak zmian w backendzie/DB — statyczne pliki są serwowane przez istniejący `@fastify/static` (`apps/api/src/main.ts`), który globuje pliki `webDist` przy starcie procesu. |
| Import / eksport | `OUT_OF_SCOPE` | Nie jest potrzebny do obecnej agendy warsztatu. |
| Rozbudowany observability | `OUT_OF_SCOPE` | Do ćwiczeń wystarczą kontrolowane fixture'y logów. |
| Pełny panel admina / monitoring / audyt | `OUT_OF_SCOPE` | Zastąpione minimalnymi trainer controls. |
| Ogólny framework pakietów błędów | `OUT_OF_SCOPE` | Zastąpiony 2–3 jawnymi, deterministycznymi defektami. |
| Gotowe rozszerzenie Chrome / skrypt Python | `OUT_OF_SCOPE` | Powstają podczas warsztatu lub jako lokalne materiały. |

## Plany

- [Workshop MVP](workshop-mvp.md)
- [Przebieg szkolenia](../warsztat/przebieg-szkolenia.md)
- [Workshop readiness — gotowość techniczna](../warsztat/workshop-readiness.md)
- [Etap 3 — zlecenia i próbki](03-zlecenia-i-probki.md)
- [Etap 4 — laboratorium](04-laboratorium.md)
- [Etap 5 — dane i obserwowalność](05-dane-i-obserwowalnosc.md) — zakres historyczny, obecnie `OUT_OF_SCOPE`
- [Etap 6 — admin i sterowanie](06-admin-i-sterowanie.md) — zastąpiony minimalnym trainer panelem
- [Etap 7 — kontrolowane błędy](07-kontrolowane-bledy.md) — zastąpiony 2–3 kontrolowanymi defektami

## Definicje statusów

| Status | Znaczenie |
|---|---|
| `PLANNED` | Zakres opisany, praca nierozpoczęta |
| `IN_PROGRESS` | Istnieje aktywna implementacja lub PR |
| `IMPLEMENTED` | Kod i testy znajdują się w PR/main |
| `VERIFIED` | Wymagane testy, CI i review zakończyły się powodzeniem |
| `DEPLOYED` | Zmiana została wdrożona i sprawdzona na Hostingerze |
| `SUPERSEDED` | Starszy plan zastąpiony przez aktualny Workshop MVP |
| `OUT_OF_SCOPE` | Obszar świadomie wyłączony z Workshop MVP |

## Definition of Done dla Workshop MVP

Workshop MVP jest gotowe, gdy:

- minimum 15 uczestników może pracować na niezależnych workspace'ach bez wpływania na dane innych osób;
- prowadzący może szybko zmienić scenariusz laboratorium, kontrolowany błąd i zresetować środowisko;
- dostępne są 2–3 deterministyczne błędy używane w konkretnych ćwiczeniach;
- dostępne są realistyczne syntetyczne logi do analizy;
- działają główne ścieżki pacjent → zlecenie → próbka → laboratorium → wynik;
- REST API i OpenAPI wspierają ćwiczenia;
- wykonano workshop readiness smoke test zgodny z `docs/warsztat/przebieg-szkolenia.md`;
- wszystkie wymagane bramki jakości są zielone;
- brak funkcji ze starego szerszego MVP blokujących finalizację.
