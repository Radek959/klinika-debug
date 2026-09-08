# Logi warsztatowe — materiały do ćwiczeń

Ten katalog zawiera syntetyczne fixture'y logów w formacie JSONL (jeden
obiekt JSON w jednej linii) do ćwiczeń analizy logów podczas warsztatu
„Tester z AI”. Materiał jest **w całości syntetyczny**: nie pochodzi z
żadnego prawdziwego środowiska, prawdziwych użytkowników ani prawdziwych
danych pacjentów.

## Format

Każda linia to jeden obiekt JSON. Nie każdy wpis ma wszystkie pola — zależy
to od rodzaju zdarzenia.

| Pole | Znaczenie |
|---|---|
| `timestamp` | Znacznik czasu ISO 8601 z milisekundami (UTC). |
| `level` | Poziom logowania: `DEBUG`, `INFO`, `WARN` albo `ERROR`. |
| `service` | Nazwa usługi (`klinika-api`). |
| `environment` | Środowisko (`workshop`). |
| `correlationId` | Identyfikator korelacji żądania — ten sam mechanizm co nagłówek `X-Correlation-ID` i pole `error.correlationId` w API Kliniki Debug. |
| `event` | Krótki, techniczny kod zdarzenia (np. `http_request_completed`, `order_created`, `lab_send_retry_scheduled`). |
| `component` | Nazwa klasy/warstwy, która wygenerowała wpis (np. `OrdersController`, `LabSimulatorService`, `LabSendRetryScheduler`). |
| `method`, `path`, `status`, `durationMs` | Dane żądania HTTP — obecne wyłącznie we wpisach `http_request_completed`. |
| `workspaceSlug`, `userLogin` | Workspace i konto, którego dotyczy zdarzenie (jeśli dotyczy). |
| `orderId`, `patientId` | Identyfikatory zlecenia/pacjenta, których dotyczy zdarzenie (syntetyczne, nie prawdziwe id z bazy). |
| `errorCode` | Kod błędu w takim samym słowniku co `error.code` w odpowiedziach API. |
| `fieldErrors` | Lista błędów pól, w takim samym kształcie co `error.fieldErrors` w API. |
| `attemptNumber`, `retryAfterSeconds` | Numer próby wysyłki do laboratorium i planowany czas ponowienia (sekundy), zgodnie z harmonogramem retry Kliniki Debug. |

Ścieżki, kody błędów, statusy HTTP i harmonogram ponowień (15 s / 30 s / 60 s)
odpowiadają rzeczywistemu REST API Kliniki Debug (`/api/v1/...`) opisanemu w
dokumentacji produktowej i OpenAPI — to nie jest wymyślony, uproszczony
przykład.

## Pliki

| Plik | Charakter materiału |
|---|---|
| `happy-path.log` | Poprawny proces pacjent → zlecenie → próbka → laboratorium → wynik, jako punkt odniesienia. |
| `patient-error.log` | Incydent w obszarze walidacji pacjenta. |
| `order-flow.log` | Niespójność w procesie zlecenia i próbek. |
| `lab-timeout.log` | Pełna chronologia timeoutu wysyłki do laboratorium z automatycznymi ponowieniami. |
| `api-diagnostics.log` | Incydent wymagający przejścia od zachowania w UI/API do analizy logów i `correlationId`. |
| `correlation-trace.log` | Kilka współbieżnych, przeplecionych procesów różnych uczestników. |
| `production-like.log` | Większy, zaszumiony materiał mieszany z wielu workspace'ów. |

## Jak pracować z tymi logami

- **Filtrowanie po `correlationId`**: jeden proces (np. jedna wysyłka do
  laboratorium i jej callback) dzieli wspólny `correlationId`. Odfiltrowanie
  jednego identyfikatora pozwala odtworzyć chronologię pojedynczego procesu
  spośród wielu przeplecionych requestów.
- **Filtrowanie po `workspaceSlug`/`userLogin`**: pozwala ograniczyć materiał
  do jednego uczestnika/workspace'u.
- **Poziomy logowania**: `ERROR` nie zawsze oznacza przyczynę problemu — w
  materiale celowo znajdują się też błędy `ERROR` niezwiązane z badanym
  wątkiem. Nie zakładaj, że pierwszy napotkany wpis `ERROR` jest odpowiedzią.
- **Chronologia**: wpisy są uporządkowane w przybliżeniu chronologicznie w
  obrębie każdego pliku, ale materiał zawiera wiele równoległych procesów —
  sama kolejność linii w pliku nie zastępuje analizy `correlationId` i pól
  `previousStatus`/`newStatus`.
- **Statusy i kody błędów** odpowiadają dokładnie tym z dokumentacji
  produktowej i OpenAPI Kliniki Debug — warto mieć je pod ręką.

## Dane syntetyczne

Wszystkie identyfikatory, loginy, nazwy workspace'ów i identyfikatory
zleceń/pacjentów w tych plikach są syntetyczne i wygenerowane
deterministycznie (`scripts/generate-workshop-logs.cjs`). Logi nie zawierają
prawdziwych numerów PESEL, haseł, tokenów, sekretów ani skopiowanych
prawdziwych stack trace'ów.
