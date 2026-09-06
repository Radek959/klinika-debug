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

## Jakość zmian

- Implementuj małe, pionowe fragmenty działające od UI do bazy i API.
- Dodawaj testy jednostkowe i integracyjne do reguł biznesowych oraz kontraktów API.
- Testy Playwright i k6 są opcjonalne; nie są warunkiem ukończenia MVP ani obowiązkową bramką CI.
- Nie zmieniaj zachowania produktu bez aktualizacji odpowiedniej dokumentacji.
- Nie oznaczaj elementu jako zweryfikowanego lub wdrożonego bez dowodu: wykonanej komendy, wyniku CI, review albo sprawdzonego środowiska.
- Celowe defekty warsztatowe muszą być oddzielone od prawidłowej implementacji i jasno identyfikowalne w kodzie.

## Playbooki

- Praca frontendowa wymaga przeczytania `docs/ai/frontend-playbook.md`.
- Praca backendowa wymaga przeczytania `docs/ai/backend-playbook.md`.
- Realizacja kompletnego zadania albo PR-a wymaga przeczytania `docs/ai/feature-delivery-playbook.md`.
