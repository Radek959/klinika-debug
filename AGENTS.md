# AGENTS.md

## Źródła wymagań

Przed wprowadzeniem zmian przeczytaj:

1. `docs/dokumentacja-produktowa.md` — reguły biznesowe i oczekiwane zachowanie produktu.
2. `docs/specyfikacja-mvp.md` — zakres pierwszej wersji.
3. `docs/architektura-techniczna.md` — zaakceptowane decyzje techniczne.
4. `docs/implementation/README.md` — aktualny etap prac, plan i statusy.

Odczytaj aktywny etap i plan wskazany w `docs/implementation/README.md`. Realizuj tylko wskazany fragment planu. Nie implementuj elementów z przyszłych etapów ani nie rozszerzaj zakresu MVP bez wyraźnego polecenia. Jeżeli dokumenty są niejednoznaczne albo sprzeczne, zatrzymaj implementację danego fragmentu i opisz problem.

## Język

Interfejs aplikacji musi być w języku polskim. Dotyczy to nawigacji, widoków, formularzy, etykiet, przycisków, filtrów, walidacji, błędów, powiadomień i potwierdzeń.

Techniczne nazwy endpointów, pól JSON, kodów błędów i wartości enum pozostają w języku angielskim. W interfejsie wartości techniczne muszą mieć polskie etykiety. Aplikacja nie zawiera przełącznika języka.

Dokumentacja produktowa i opisy endpointów w OpenAPI są po polsku. Nazwy symboli w kodzie mogą być po angielsku.

## Dane i bezpieczeństwo

- Używaj wyłącznie danych syntetycznych.
- Nie dodawaj prawdziwych danych medycznych ani osobowych do kodu, seedów, fixture'ów, testów i dokumentacji.
- Każda operacja na danych użytkownika musi respektować izolację workspace'u.
- Zwykłe konta mają jeden profil uprawnień `STAFF`.
- Panel `/admin` ma osobne uwierzytelnienie techniczne i nie jest częścią uprawnień użytkownika aplikacji.
- Nie pokazuj panelu `/admin` w nawigacji produktu.
- Dokumentacja produktowa i materiały dla uczestników nie ujawniają panelu `/admin` ani wewnętrznego katalogu kontrolowanych błędów.

## Kontrolowane błędy

Poprawny tryb bazowy jest obowiązkowy. Celowe błędy mogą być aktywowane wyłącznie przez globalne, deterministyczne pakiety sterowane z `/admin`.

- Nie dodawaj celowego błędu bez możliwości jego wyłączenia.
- Nie uzależniaj pakietów błędów od pojedynczego konta.
- Nie mieszaj poprawnych scenariuszy symulatora laboratorium z celowymi defektami aplikacji.
- Nie maskuj przypadkowych regresji jako błędów warsztatowych.
- Każdy pakiet błędów powinien mieć opis, oczekiwany efekt i sposób przywrócenia trybu `CLEAN`.

## API i proces asynchroniczny

- API użytkownika jest wersjonowane pod `/api/v1`.
- Każdy request i błąd posiada `correlationId`.
- Wysyłka do laboratorium respektuje idempotencję i reguły retry opisane w dokumentacji.
- Webhook laboratorium ma osobne uwierzytelnienie.
- Ponowne przetworzenie tego samego `eventId` nie może duplikować wyników.
- Logi nie mogą ujawniać niezamaskowanych danych pacjenta.

## Granice repozytorium

- W tym repozytorium nie implementujemy gotowego rozszerzenia Chrome, skryptu Python ani notatek prowadzącego.
- Repozytorium ma zapewnić stabilny interfejs, REST API, dane syntetyczne i identyfikatory `correlationId` potrzebne do ćwiczeń warsztatowych.
- Notatki prowadzącego powstaną później w Notion na podstawie finalnej wersji aplikacji, poza kodem aplikacji.

## Jakość zmian

- Implementuj małe, pionowe fragmenty działające od UI do bazy i API.
- Dodawaj testy jednostkowe i integracyjne do reguł biznesowych oraz kontraktów API.
- Testy k6 są opcjonalne.
- Playwright (`npm run test:workshop-browser`, uruchamiany przez `npm run verify:pr`) jest OBOWIĄZKOWĄ LOKALNĄ bramką przed KAŻDYM PR-em (patrz `docs/ai/feature-delivery-playbook.md`). Playwright:
  - NIE jest wymaganym checkiem GitHub Actions;
  - NIE jest uruchamiany w CI;
  - NIE jest uruchamiany przeciwko Hostingerowi ani żadnemu innemu publicznemu hostowi;
  - działa wyłącznie przeciwko lokalnemu full-stackowi Kliniki Debug pod adresem `WORKSHOP_BROWSER_BASE_URL` (opcjonalny — domyślnie `http://localhost:3000`), NIGDY `WORKSHOP_BASE_URL` (ta zmienna jest wyłącznie dla `workshop:smoke` przeciwko wdrożonemu środowisku);
  - bez `WORKSHOP_E2E_CONFIRM=RUN` kończy się błędem (non-zero exit code) — samo "X skipped" NIE jest przejściem tej bramki.
  Jeżeli lokalne środowisko nie jest jeszcze przygotowane: `npm run workshop:local:prepare` (env, migracje, provisioning `tester01`/`warsztat-01`, Chromium — bez ręcznego generowania hashy Argon2 ani zgadywania kolejności). Aplikacja lokalnie działa przez `npm run workshop:local:start` (production-like build pod `http://localhost:3000`), a przed PR-em: `npm run verify:pr` (z `WORKSHOP_E2E_CONFIRM=RUN`).
  **Jeżeli `npm run verify:pr` NIE przeszło, PR nie jest gotowy do merge'a.** Jeżeli sandbox agenta nie umożliwia uruchomienia lokalnego full-stacka (np. brak Dockera/MySQL): jawnie oznacz „Local Playwright: NOT RUN" w opisie PR-a, NIE zastępuj tego wynikiem CI i NIE uruchamiaj Playwrighta przeciwko Hostingerowi — właściciel/developer musi wykonać lokalne `verify:pr` przed finalnym mergem. Nie wymagaj od AI uruchamiania Dockera, jeśli sandbox go nie zapewnia.
- Nie zmieniaj zachowania produktu bez aktualizacji odpowiedniej dokumentacji.
- Nie oznaczaj elementu jako zweryfikowanego lub wdrożonego bez dowodu: wykonanej komendy, wyniku CI, review albo sprawdzonego środowiska.
- Celowe defekty warsztatowe muszą być oddzielone od prawidłowej implementacji i jasno identyfikowalne w kodzie.

## Playbooki

- Praca frontendowa wymaga przeczytania `docs/ai/frontend-playbook.md`.
- Praca backendowa wymaga przeczytania `docs/ai/backend-playbook.md`.
- Realizacja kompletnego zadania albo PR-a wymaga przeczytania `docs/ai/feature-delivery-playbook.md`.
