# Workshop MVP — gotowość techniczna

**Status:** dokument techniczno-operacyjny repozytorium (NIE notatki prowadzącego).
**Cel:** opisać, jak przygotować i zweryfikować środowisko Kliniki Debug przed
warsztatem „Tester z AI”, oraz co zrobić, gdy coś pójdzie nie tak w trakcie.

Ten dokument nie opisuje przebiegu dydaktycznego (patrz
[`przebieg-szkolenia.md`](przebieg-szkolenia.md)) ani nie zawiera haseł.

## 1. Audit zgodności szkolenia

Zestawienie każdego elementu z [`przebieg-szkolenia.md`](przebieg-szkolenia.md)
z konkretną, zaimplementowaną funkcją Kliniki Debug.

| Element szkolenia | Wymaganie | Dowód | Status |
|---|---|---|---|
| Etap A — logowanie, izolacja, polski UI | stabilne logowanie, workspace per uczestnik, PL interfejs | `AuthController` (`/api/v1/auth/login`), `workspaceId` w każdej encji domenowej, `apps/web/src/**` (polskie etykiety) | OK |
| Etap A — główna ścieżka | pacjent → zlecenie → próbka → laboratorium → wynik | `PatientsController`, `OrdersController` (`create`, `samples`, `send`), `LabSimulatorService`, `apps/api/test/lab-results.e2e-spec.ts` | OK |
| Ćwiczenie 1/2 — kontekst vs brak kontekstu | realne reguły domenowe silniejsze niż ogólna wiedza AI | `packages/domain/src/patients/patient-write.ts`, `packages/domain/src/patients/pesel.ts`, `docs/dokumentacja-produktowa.md` | OK |
| Etap C — pełny proces zlecenia | wiele materiałów, częściowe pobranie, statusy, historia, wyniki częściowe/kompletne | `packages/domain/src/orders/sample-collection.ts`, `OrderHistory`, scenariusze `PARTIAL_SUCCESS`/`COMPLETED` w `lab-simulator` | OK |
| Etap D — dane testowe | wielokrotne tworzenie pacjentów/zleceń, jednoznaczne walidacje | `CreatePatientDto`, `apps/api/src/patients/patient-write-domain.spec.ts` | OK |
| Etap E — UI → DevTools → API | REST API, jednolity format błędów, `correlationId`, scenariusze VALIDATION_ERROR/RATE_LIMIT/SERVER_ERROR/TIMEOUT, retry, TECHNICAL_ERROR, panel prowadzącego | `ApiExceptionFilter`, `CurrentCorrelationId`, `LabSendRetryService`, `AdminController` (`/admin/api/config`) | OK |
| Etap F — analiza logów | realistyczne, syntetyczne, production-like logi z wieloma `correlationId`, retry, szumem | `workshop-assets/logs/*.log` (7 fixture'ów, `scripts/validate-workshop-logs.cjs`) | OK |
| Etap G — bug report | 2-3 deterministyczne, obserwowalne, odwracalne defekty | `apps/api/src/workshop-config/controlled-bug.ts` (`PATIENT_GUARDIAN`, `ORDER_FLOW`, `API_DIAGNOSTICS`), `apps/api/test/workshop-controlled-bugs.e2e-spec.ts` | OK |
| Etap H — API z AI | kompletne OpenAPI dla endpointów uczestnika, bez ujawnienia `/admin` | `app.setup.ts` (`SwaggerModule`, `@ApiExcludeController` na `AdminController`) | OK |
| Panel prowadzącego (sekcja 4) | scenariusz laboratorium, `CLEAN`/1 defekt, reset pojedynczego uczestnika + reset całego środowiska, odczyt configu | `AdminController`, `resetSingleWorkshopWorkspace`, `resetWorkshopWorkspaces`, `WorkshopConfigService` | OK |
| DoD #1 — 15+ uczestników równolegle | izolowane workspace'y i konta | `provisionWorkshopWorkspaces`, `workshop-provisioning.e2e-spec.ts`, `workshop-isolation.e2e-spec.ts` | OK |
| DoD #8 — pełny smoke test zgodny z przebiegiem | zautomatyzowany smoke test wdrożonego środowiska | `npm run workshop:smoke` (`scripts/workshop-smoke.cjs`) | **Kod gotowy; rzeczywiste uruchomienie przeciwko wdrożonemu środowisku wymaga wykonania przez właściciela projektu — patrz sekcja 7.** |
| Etap I — narzędzia własne (Python/Chrome) | świadomie poza repozytorium | `AGENTS.md`, `docs/implementation/README.md` ("Granice narzędzi warsztatowych") | OK (out of scope, celowo) |

Elementy niepotrzebne do szkolenia (import/eksport, pełny observability,
rozbudowany admin, ogólny framework błędów, gotowe rozszerzenie Chrome/skrypt
Python) pozostają świadomie `OUT_OF_SCOPE` — patrz `docs/implementation/README.md`.

Panel prowadzącego dodatkowo zawiera: szybkie presety (`labScenario` +
`controlledBug` + `labDelayMs` jednym kliknięciem) oraz dynamiczne opisy pod
selectami scenariusza laboratorium i kontrolowanego błędu — szczegóły w
`docs/implementation/README.md` ("Workshop MVP — trainer controls").

## 2. Dzień przed szkoleniem

```text
1. deploy aplikacji           → npm run build:hostinger:workshop
                                 (albo build:hostinger + osobno workshop:prepare)
2. npm run workshop:prepare    (pomijalne, jeśli użyto build:hostinger:workshop)
3. npm run workshop:smoke      (bez potwierdzenia = tylko read-only preflight)
4. WORKSHOP_SMOKE_CONFIRM=RUN npm run workshop:smoke
                                 (pełny smoke: loguje uczestników, resetuje,
                                  przechodzi główną ścieżkę, sprawdza
                                  kontrolowane defekty, sprząta na końcu)
5. manualny UI smoke (patrz sekcja 6)
6. reset środowiska            → npm run workshop:reset albo reset w /admin
7. potwierdź w /admin: labScenario = SUCCESS, controlledBug = CLEAN
```

## 3. 30 minut przed szkoleniem

- [ ] `GET /health/live` zwraca `status: ok`
- [ ] `GET /health/ready` zwraca `status: ok`
- [ ] logowanie `tester01` działa
- [ ] logowanie do `/admin` działa
- [ ] `/api/docs` (OpenAPI) jest dostępne
- [ ] fixture'y logów są dostępne uczestnikom w UI (**Materiały**, `/materials`), a nie tylko w repozytorium (`workshop-assets/logs/`)
- [ ] konfiguracja w `/admin`: `SUCCESS`
- [ ] konfiguracja w `/admin`: `CLEAN`

## 4. Dane uczestników

- Schemat loginów: `testerNN` (`tester01` … `tester15` dla 15 uczestników,
  dwucyfrowy numer z zerem wiodącym).
- Liczba workspace'ów: 1 workspace na uczestnika (`warsztat-NN`), domyślnie 15
  — konfigurowalne przez `WORKSHOP_PARTICIPANTS` w `workshop:prepare`. Przy
  pracy w parach dopuszczalne jest 1 workspace na parę (mniejsza liczba
  uczestników przekazana do `workshop:prepare`).
- Wspólne hasło kont `testerNN`: zmienna środowiskowa `WORKSHOP_STAFF_PASSWORD`
  (ustawiana w konfiguracji wdrożenia Hostinger, NIE w repozytorium). Hasło
  panelu `/admin` odpowiada `ADMIN_PASSWORD_HASH` i jest znane wyłącznie
  prowadzącemu.
- To repozytorium NIE zawiera haseł — patrz `.env.example` dla listy
  wymaganych zmiennych (bez wartości produkcyjnych).

## 5. Recovery — co zrobić, gdy coś pójdzie nie tak

| Sytuacja | Działanie |
|---|---|
| Uczestnik zepsuł własne dane | `/admin` → sekcja "Reset uczestnika" → wybierz `testerNN` / `warsztat-NN` → potwierdź. Resetowane są WYŁĄCZNIE dane tego jednego workspace'u; jego sesja zostaje unieważniona (uczestnik loguje się ponownie tym samym loginem/hasłem). Inni uczestnicy NIE są resetowani, a globalna konfiguracja (`labScenario`/`controlledBug`/`labDelayMs`) pozostaje bez zmian. Backend: `resetSingleWorkshopWorkspace` (`POST /admin/api/workspaces/:slug/reset`). |
| Wszyscy muszą zacząć od nowa | `/admin` → `Resetuj środowisko` (albo `npm run workshop:reset`) — resetuje WSZYSTKIE workspace'y `warsztat-NN`, wylogowuje wszystkich uczestników (unieważnia ich sesje) i przywraca globalną konfigurację do `SUCCESS` + `CLEAN` + 5 minut. Nie rusza `klinika-pokazowa`. |
| Aktywny jest zły `controlledBug` | `/admin` → ustaw `controlledBug = CLEAN`. Zmiana jest natychmiastowa, bez restartu aplikacji. |
| Aktywny jest zły `labScenario` | `/admin` → ustaw `labScenario = SUCCESS`. Dotyczy NOWYCH wysyłek; zadania już zaplanowane (retry) używają scenariusza zapisanego w chwili wysyłki. |
| Sesja uczestnika została unieważniona (np. po reset) | Uczestnik loguje się ponownie tym samym loginem/hasłem — to oczekiwany, nieszkodliwy efekt uboczny resetu. Frontend uczestnika przechodzi do `/login` SAM, przy najbliższym requestcie po resecie (`401 SESSION_EXPIRED` obsługiwane centralnie w `apps/web/src/api/client.ts` + `App.tsx`) — nie jest potrzebne F5 ani ręczne „Wyloguj”. |
| Środowisko wygląda niespójnie i nie wiadomo dlaczego | Wykonaj pełną sekwencję z sekcji "Emergency clean state" poniżej. |

### Emergency clean state

Jednoznaczna sekwencja przywracająca środowisko do stanu startowego:

```text
1. /admin → labScenario = SUCCESS
2. /admin → controlledBug = CLEAN
3. /admin → Resetuj środowisko (potwierdź) — albo npm run workshop:reset
4. uczestnicy logują się ponownie tym samym testerNN — frontend sam
   przechodzi do /login przy najbliższym requestcie (401 SESSION_EXPIRED),
   bez F5 ani ręcznego „Wyloguj”
```

Ta sama sekwencja jest wykonywana automatycznie w kroku sprzątania
`npm run workshop:smoke` (`finally`) — jeśli smoke zakończy się z jasnym
komunikatem o nieudanym sprzątaniu, wykonaj powyższą sekwencję ręcznie.

## 6. Manualny UI smoke

Krótka checklista do wykonania przez człowieka na finalnym, wdrożonym
środowisku (nie jest automatycznie oznaczana jako wykonana):

```text
[ ] login tester
[ ] lista pacjentów
[ ] create patient
[ ] edit patient
[ ] create order
[ ] register sample
[ ] send to lab
[ ] history
[ ] result
[ ] DevTools request/response
[ ] correlationId
[ ] admin
[ ] controlled bug
[ ] reset
[ ] Materiały
[ ] podgląd logu
[ ] pobranie .log
```

## 7. Statusy — IMPLEMENTED vs VERIFIED vs DEPLOYED

`IMPLEMENTED`, `VERIFIED` i `DEPLOYED` mają różne znaczenie (patrz
`docs/implementation/README.md`, sekcja "Definicje statusów").

- kod Workshop MVP (uczestnicy, trainer controls i recovery, kontrolowane
  defekty, log fixture'y, production prepare, smoke runner) jest
  **`IMPLEMENTED`**;
- aktualne CI dla Workshop MVP wykonuje i przechodzi testy migracji testowej
  bazy, `npm run check` (lint, typecheck, testy jednostkowe, build),
  `npm run test:integration` oraz build produkcyjny i
  `npm run test:production-start` — patrz status CI aktualnego PR-a w GitHub
  Actions tego repozytorium;
- brak przydzielonego runnera GitHub Actions NIE jest już aktualnym
  blockerem — problem platformowy opisywany wcześniej w tym dokumencie
  (analogiczny do #29–#31) został rozwiązany;
- **rzeczywisty `npm run workshop:smoke` przeciwko wdrożonemu środowisku
  Hostinger NIE został tu wykonany** (brak dostępu do produkcyjnego/warsztatowego
  wdrożenia z tego środowiska) — to odrębny krok od zielonego CI repozytorium.

Zielone CI pozwala uznać warstwę kodową/techniczną Workshop MVP za
**`VERIFIED`** w rozumieniu definicji z `docs/implementation/README.md`
("Wymagane testy, CI i review zakończyły się powodzeniem"). To NIE jest
jednak `DEPLOYED` — status wdrożonego, gotowego na warsztat środowiska nadal
wymaga wykonania (i potwierdzenia wyniku) przez właściciela projektu:

1. deploymentu na Hostinger;
2. `npm run workshop:prepare` na wdrożonym środowisku;
3. `WORKSHOP_SMOKE_CONFIRM=RUN npm run workshop:smoke` przeciwko wdrożonemu
   środowisku, z wynikiem `RESULT: PASS`;
4. manualnego UI smoke z sekcji 6;
5. resetu środowiska (sekcja 2, krok 6) przed wejściem uczestników.

Dopiero po pozytywnym wykonaniu punktów 1–5 status może przejść na
`DEPLOYED`. Nie oznaczaj `DEPLOYED` bez faktycznego wykonania tych kroków —
zielone CI repozytorium potwierdza gotowość kodu, nie gotowość wdrożonego
środowiska warsztatowego.
