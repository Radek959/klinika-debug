# Backend playbook

## Kiedy używać

Użyj tego playbooka przy każdej zmianie w `apps/api`, `packages/domain`, `packages/api-contracts`, Prisma, migracjach, seedach, integracji laboratorium, autoryzacji, logach lub OpenAPI.

## Zasady

- Stos technologiczny: NestJS, Fastify, Prisma i MySQL.
- Publiczne API użytkownika jest wersjonowane pod `/api/v1`.
- Workspace użytkownika pobieraj z sesji lub tokenu, nigdy z payloadu requestu.
- Każda operacja na danych użytkownika musi zawierać izolację `workspaceId`.
- Endpointy nie ujawniają, czy zasób istnieje w innym workspace.
- Błędy mają jednolity format i zawierają `correlationId`.
- Każdy request otrzymuje `correlationId`; poprawny `X-Correlation-ID` klienta może zostać zachowany.
- Opisy OpenAPI, przykłady i komunikaty dla użytkownika pisz po polsku.
- DTO walidują strukturę requestu, a warstwa domenowa egzekwuje reguły biznesowe.
- Złożone zapisy, importy i zmiany statusów realizuj transakcyjnie.
- Migracje muszą być bezpieczne dla MySQL i możliwe do uruchomienia w Hostingerze.
- Idempotencję stosuj w wysyłce do laboratorium i ponownym przetwarzaniu callbacków.
- Logi nie mogą zawierać pełnego PESEL-u, dokumentu, adresu, kontaktu, wartości wyników ani sekretów.
- Integracje i `/admin` mają osobne uwierzytelnienie techniczne.
- `/admin` nie jest częścią publicznego API produktu ani uprawnień `STAFF`.
- Implementacja musi być zgodna z deploymentem na Hostingerze i ograniczeniami MySQL.

## Checklista

- Czy `workspaceId` pochodzi z sesji i występuje we wszystkich zapytaniach do danych użytkownika?
- Czy przypadek obcego workspace'u zwraca bezpieczny błąd, zwykle `404`?
- Czy request i błąd mają `correlationId`?
- Czy DTO i reguły domenowe odróżniają błąd struktury od naruszenia reguły biznesowej?
- Czy operacja wymagająca atomowości używa transakcji?
- Czy migracja nie niszczy danych i działa na pustej bazie?
- Czy mechanizm jest idempotentny tam, gdzie wymaga tego dokumentacja?
- Czy logi są zamaskowane i nie zawierają sekretów?
- Czy OpenAPI jest po polsku i opisuje realny kontrakt?
- Czy testy jednostkowe pokrywają reguły domenowe?
- Czy testy integracyjne pokrywają endpointy, izolację workspace'u i najważniejsze błędy?
- Czy testowa baza jest zabezpieczona przed przypadkowym użyciem bazy developerskiej lub produkcyjnej?
