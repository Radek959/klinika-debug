# Klinika Debug — specyfikacja MVP

**Wersja:** 1.0  
**Status:** zaakceptowana  
**Dokument bazowy:** `klinika-debug-dokumentacja-produktowa.md`, wersja 1.1

## 1. Cel MVP

Celem MVP jest dostarczenie kompletnego środowiska Kliniki Debug, które pozwala wielu użytkownikom równocześnie przejść proces:

> pacjent → zlecenie badań → rejestracja próbek → wysłanie do laboratorium → oczekiwanie → wynik lub błąd

MVP musi jednocześnie udostępniać interfejs webowy, REST API, dokumentację OpenAPI, dane syntetyczne, logi techniczne oraz kontrolowany mechanizm zmiany zachowania środowiska.

Specyfikacja określa zakres funkcjonalny. Nie wybiera jeszcze języka programowania, frameworków, bazy danych ani dostawcy hostingu.

## 2. Zasady projektowe

1. **Jeden spójny proces** — priorytetem jest pełna obsługa zlecenia, a nie duża liczba niezależnych modułów.
2. **Poprawna wersja bazowa** — domyślnie system działa zgodnie z dokumentacją produktową.
3. **Deterministyczne scenariusze** — zmienione zachowanie aplikacji można powtórzyć i wyłączyć.
4. **Wspólny stan środowiska** — konfiguracja scenariuszy obowiązuje wszystkich użytkowników.
5. **Odseparowane dane** — każdy użytkownik pracuje na danych własnej placówki.
6. **Brak prawdziwych danych** — aplikacja przyjmuje i przechowuje wyłącznie dane syntetyczne.
7. **API jako pełnoprawna część produktu** — główne operacje dostępne w UI mają odpowiedniki w API.
8. **Możliwość szybkiego odtworzenia stanu** — dane i konfigurację można przywrócić bez ręcznej ingerencji w bazę.
9. **Polski interfejs** — wszystkie elementy widoczne dla użytkownika są prezentowane po polsku.

## 3. Użytkownicy i dostęp

### 3.1. Konta aplikacyjne

- System posiada co najmniej 15 kont uczestników i jedno konto zapasowe.
- Każde konto jest przypisane do osobnego workspace’u reprezentującego placówkę.
- Wszystkie konta mają identyczny profil uprawnień `STAFF`.
- Konto `STAFF` może wykonać cały główny proces.
- Użytkownicy nie rejestrują kont samodzielnie.
- Dane logowania są przygotowane przed udostępnieniem środowiska.
- Konto widzi wyłącznie dane własnego workspace’u.

### 3.2. Panel techniczny

- Panel techniczny znajduje się pod `/admin`.
- Nie korzysta z roli ani konta aplikacyjnego.
- Jest zabezpieczony niezależnym mechanizmem dostępnym wyłącznie właścicielowi środowiska.
- Nie jest widoczny w nawigacji zwykłego użytkownika.
- Nie jest opisany w dokumentacji produktowej dla użytkowników.

## 4. Zakres funkcjonalny MVP

### 4.1. Logowanie

MVP obejmuje:

- formularz loginu i hasła;
- obsługę poprawnego i niepoprawnego logowania;
- utworzenie sesji użytkownika;
- automatyczne wylogowanie po 60 minutach bezczynności;
- ręczne wylogowanie;
- przypisanie użytkownika do workspace’u na podstawie sesji lub tokenu.

MVP nie obejmuje:

- samodzielnej rejestracji;
- resetowania hasła przez e-mail;
- logowania społecznościowego;
- uwierzytelniania wieloskładnikowego.

### 4.2. Panel główny

Panel pokazuje:

- nazwę bieżącej placówki;
- liczbę zleceń w poszczególnych statusach;
- pięć ostatnio zmodyfikowanych zleceń;
- zlecenia oczekujące na wynik;
- zlecenia z błędem technicznym;
- nieprzeczytane powiadomienia.

Panel nie pokazuje aktywnego scenariusza błędów ani konfiguracji środowiska.

### 4.3. Pacjenci

Lista pacjentów zapewnia:

- paginację;
- wyszukiwanie po imieniu, nazwisku, PESEL-u i numerze dokumentu;
- filtrowanie według aktywności i typu identyfikatora;
- sortowanie po nazwisku, dacie urodzenia oraz dacie utworzenia;
- przejście do szczegółów;
- eksport aktualnego wyniku wyszukiwania.

Formularz pacjenta zapewnia:

- utworzenie pacjenta z PESEL-em;
- utworzenie pacjenta z innym dokumentem;
- obsługę pacjenta niepełnoletniego i opiekuna;
- walidację zgodną z dokumentacją produktową;
- wykrywanie duplikatów w obrębie workspace’u;
- edycję danych;
- oznaczenie pacjenta jako nieaktywnego.

Nie przewiduje się fizycznego usuwania pacjentów mających zlecenia.

### 4.4. Katalog badań

MVP zawiera pięć badań:

- `MORF`;
- `CRP`;
- `TSH`;
- `GLU`;
- `URINE`.

Katalog:

- jest wspólny dla wszystkich workspace’ów;
- jest dostępny do odczytu w UI i API;
- zawiera materiał, wymagane pola, parametry i przewidywany czas realizacji;
- pozwala wyszukiwać i filtrować badania;
- nie jest edytowany przez użytkownika aplikacji.

### 4.5. Tworzenie zlecenia

Formularz umożliwia:

- wybór jednego aktywnego pacjenta;
- dodanie jednego lub wielu badań;
- usunięcie badania przed rejestracją próbki;
- wybór priorytetu `ROUTINE` albo `URGENT`;
- uzupełnienie pól wymaganych przez badanie;
- podgląd automatycznie wyliczonych rodzajów próbek;
- zapis zlecenia jako `DRAFT`.

System grupuje badania wymagające tego samego materiału w jednej próbce. Zlecenie `CRP`, `TSH` i `URINE` tworzy wymaganie dla dwóch próbek: surowicy i moczu.

### 4.6. Rejestracja próbek

Dla każdej wymaganej próbki użytkownik podaje:

- kod kreskowy;
- datę i godzinę pobrania.

System:

- waliduje unikalność kodu w workspace’ie;
- blokuje datę przyszłą i wcześniejszą od utworzenia zlecenia;
- zapisuje użytkownika rejestrującego pobranie;
- ustawia `SAMPLE_COLLECTION_IN_PROGRESS`, gdy brakuje kolejnych próbek;
- ustawia `SAMPLE_COLLECTED`, gdy wszystkie próbki są gotowe;
- blokuje zmianę pacjenta i badań po zarejestrowaniu pierwszej próbki.

### 4.7. Wysłanie do laboratorium

Akcja wysłania jest dostępna wyłącznie dla zlecenia `SAMPLE_COLLECTED`.

System:

- buduje payload na podstawie pacjenta, badań i próbek;
- generuje `Idempotency-Key` i `correlationId`;
- wysyła request do symulatora laboratorium;
- zapisuje metadane requestu bez niezamaskowanych danych wrażliwych;
- obsługuje `202 Accepted`;
- obsługuje błędy `4xx`, `429`, `5xx` i timeout;
- wykonuje retry zgodnie z dokumentacją produktową;
- aktualizuje status i historię zlecenia.

W UI użytkownik widzi rezultat operacji, status zlecenia i `correlationId` przy błędzie technicznym.

### 4.8. Oczekiwanie i wyniki

Po przyjęciu zlecenia:

- symulator może ustawić `PROCESSING`;
- UI odświeża dane co 10 sekund;
- użytkownik może odświeżyć dane ręcznie;
- callback może zwrócić wynik częściowy, kompletny, odrzucenie albo błąd;
- system ignoruje ponowne przetworzenie tego samego `eventId`;
- wyniki częściowe pozostają widoczne po kolejnych callbackach;
- komplet wyników ustawia `COMPLETED`;
- rezultat tworzy powiadomienie w aplikacji.

Widok wyniku prezentuje dane zwrócone przez laboratorium bez generowania diagnozy lub zaleceń.

### 4.9. Historia zlecenia

Historia zawiera:

- utworzenie i edycję;
- rejestrację próbek;
- wysłanie do laboratorium;
- odpowiedź synchroniczną;
- retry;
- zmianę statusu;
- callback z laboratorium;
- błąd techniczny.

Każdy wpis zawiera czas, typ zdarzenia, wykonawcę i dostępne identyfikatory techniczne.

### 4.10. Powiadomienia

MVP obejmuje powiadomienia wewnątrz aplikacji dla:

- wyniku częściowego;
- wyniku kompletnego;
- odrzucenia próbki albo zlecenia;
- błędu technicznego integracji.

Wysyłka e-mail i SMS pozostaje poza MVP.

### 4.11. Import i eksport

Import pacjentów:

- przyjmuje plik CSV w UTF-8;
- obsługuje do 1000 wierszy;
- waliduje cały plik przed zapisem;
- jest atomowy;
- zwraca raport z numerem wiersza, polem i kodem błędu.

Eksport:

- obsługuje pacjentów i zlecenia;
- uwzględnia aktywne filtry;
- wspiera CSV i JSON;
- zawiera wyłącznie dane bieżącego workspace’u.

## 5. Widoki MVP

| Widok | Najważniejsze elementy |
|---|---|
| `/login` | Logowanie i błędy uwierzytelnienia |
| `/dashboard` | Podsumowanie zleceń i powiadomienia |
| `/patients` | Lista, wyszukiwanie, filtry, eksport i import |
| `/patients/new` | Formularz nowego pacjenta |
| `/patients/{id}` | Dane pacjenta, edycja i historia zleceń |
| `/orders` | Lista zleceń, statusy, filtry i eksport |
| `/orders/new` | Tworzenie zlecenia |
| `/orders/{id}` | Próbki, wysyłka, wyniki, historia i błędy |
| `/tests` | Katalog badań |
| `/notifications` | Lista powiadomień |
| `/docs` | Dokumentacja produktowa |
| `/api/docs` | Interaktywna dokumentacja OpenAPI |

Adres `/admin` jest częścią warstwy technicznej, a nie nawigacji produktu.

### 5.1. Język interfejsu

- Nawigacja, nagłówki, etykiety, przyciski, filtry i formularze są po polsku.
- Walidacje, błędy, potwierdzenia i powiadomienia są po polsku.
- Statusy techniczne, np. `SAMPLE_COLLECTED`, są prezentowane jako polskie etykiety, np. „Próbki pobrane”.
- Dokumentacja produktowa oraz opisy endpointów w OpenAPI są po polsku.
- Nazwy endpointów, pól JSON, kodów błędów i enumów pozostają po angielsku.
- MVP nie zawiera przełącznika języka ani wersji angielskiej interfejsu.

## 6. REST API w MVP

MVP implementuje wszystkie endpointy wskazane w dokumentacji produktowej:

| Obszar | Endpointy |
|---|---|
| Pacjenci | `POST /patients`, `GET /patients`, `GET /patients/{id}`, `PATCH /patients/{id}` |
| Pliki | `POST /patients/import`, `GET /exports/patients`, `GET /exports/orders` |
| Badania | `GET /tests` |
| Zlecenia | `POST /orders`, `GET /orders`, `GET /orders/{id}`, `PATCH /orders/{id}` |
| Próbki | `POST /orders/{id}/samples` |
| Laboratorium | `POST /orders/{id}/send`, `POST /integrations/lab/results` |
| Historia | `GET /orders/{id}/history` |

Wymagania:

- wersjonowanie pod `/api/v1`;
- JSON w UTF-8, z wyjątkiem uploadu CSV;
- token Bearer dla endpointów użytkownika;
- osobne uwierzytelnienie integracji dla webhooka;
- jednolity format błędów;
- paginacja i walidacja parametrów;
- `correlationId` w każdym requeście i błędzie;
- pełny opis requestów, odpowiedzi i przykładów w OpenAPI.

## 7. Symulator laboratorium

Symulator jest oddzielnym logicznie komponentem, nawet jeśli MVP zostanie wdrożone jako jedna aplikacja.

### 7.1. Odpowiedź na zlecenie

Symulator odbiera zlecenie i może:

- przyjąć je odpowiedzią `202`;
- odrzucić payload odpowiedzią `400` albo `422`;
- zwrócić `409` dla konfliktu idempotencji;
- zwrócić `429`;
- zwrócić `500` lub `503`;
- nie odpowiedzieć w wymaganym czasie.

### 7.2. Przetwarzanie

Po przyjęciu zlecenia symulator:

- generuje `externalOrderId`;
- ustawia przewidywany czas zakończenia;
- zapisuje zaplanowane zdarzenia;
- wysyła callbacki do Kliniki Debug;
- generuje syntetyczne, powtarzalne wyniki na podstawie identyfikatora zlecenia.

### 7.3. Tryby odpowiedzi

| Tryb | Zachowanie |
|---|---|
| `SUCCESS` | Jeden callback z kompletem wyników |
| `PARTIAL_SUCCESS` | Co najmniej dwa callbacki, najpierw wynik częściowy |
| `SAMPLE_REJECTED` | Odrzucenie jednej albo wszystkich próbek |
| `VALIDATION_ERROR` | Odpowiedź `422` na wysłanie |
| `RATE_LIMIT` | `429` przed późniejszym przyjęciem |
| `SERVER_ERROR` | Błąd `5xx` przed przyjęciem albo po wyczerpaniu retry |
| `TIMEOUT` | Brak odpowiedzi synchronicznej albo callbacka |

### 7.4. Opóźnienie

Globalna konfiguracja pozwala wybrać:

- 10 sekund;
- 60 sekund;
- 300 sekund;
- brak callbacka.

Domyślny tryb poprawnego środowiska to `SUCCESS` z opóźnieniem 300 sekund.

Tryb symulatora nie jest pakietem błędów aplikacji. Przykładowo `RATE_LIMIT` albo `TIMEOUT` reprezentuje zdarzenie, które Klinika Debug ma poprawnie obsłużyć zgodnie z dokumentacją. Pakiet błędów może dopiero celowo zmienić lub zepsuć tę obsługę.

## 8. Dane początkowe

### 8.1. Workspace’y

MVP przygotowuje:

- 15 workspace’ów podstawowych;
- 1 workspace zapasowy;
- 1 konto `STAFF` dla każdego workspace’u.

### 8.2. Katalog

Wspólny katalog zawiera pięć badań określonych w dokumentacji produktowej wraz z materiałami i parametrami wyników.

### 8.3. Presety danych

Panel techniczny oferuje dwa globalne presety resetu:

| Preset | Dane na workspace | Zastosowanie |
|---|---|---|
| `STANDARD` | 100 pacjentów i 40 zleceń | Zwykła praca w aplikacji |
| `LARGE` | 5000 pacjentów i 1000 zleceń | Paginacja, eksport, skrypty i wydajność |

Dane obejmują:

- osoby dorosłe i niepełnoletnie;
- polskie znaki, nazwiska dwuczłonowe i apostrofy;
- prawidłowe PESEL-e;
- pacjentów z innym dokumentem;
- aktywnych i nieaktywnych pacjentów;
- zlecenia we wszystkich dostępnych statusach;
- wyniki kompletne, częściowe i odrzucone;
- daty z różnych okresów i godziny bliskie zmianie dnia.

Reset zawsze odtwarza ten sam zestaw danych dla danego presetu.

## 9. Panel `/admin`

Panel pozwala globalnie:

- zobaczyć bieżący stan środowiska;
- wybrać tryb symulatora laboratorium;
- ustawić opóźnienie;
- wybrać aktywny pakiet błędów;
- przywrócić tryb `CLEAN`;
- zresetować dane wszystkich workspace’ów do `STANDARD` albo `LARGE`;
- usunąć oczekujące zadania symulatora przed resetem;
- sprawdzić stan aplikacji, bazy i symulatora;
- pobrać logi według czasu, `orderId` albo `correlationId`.

Nie przewiduje się:

- konfiguracji pojedynczego konta;
- konfiguracji pojedynczego workspace’u;
- edytowania danych pacjentów i zleceń z panelu;
- udostępniania panelu użytkownikom aplikacji.

Operacje resetu wymagają dodatkowego potwierdzenia w interfejsie.

## 10. Mechanizm kontrolowanych błędów

### 10.1. Zakres MVP

MVP zawiera infrastrukturę pozwalającą zmienić zachowanie UI, API, integracji i operacji na danych bez osobnych wdrożeń.

Zasady:

- domyślny stan to `CLEAN`;
- aktywny jest maksymalnie jeden pakiet błędów;
- pakiet obowiązuje globalnie;
- pakiet błędów jest niezależny od wybranego trybu symulatora laboratorium;
- każdy błąd ma stały identyfikator;
- zachowanie jest deterministyczne;
- wyłączenie pakietu przywraca zachowanie zgodne z dokumentacją;
- interfejs użytkownika nie informuje o aktywnym pakiecie.

### 10.2. Początkowe pakiety

| Pakiet | Obszar |
|---|---|
| `CLEAN` | Poprawne zachowanie systemu |
| `PATIENT_DATA` | Formularze, walidacja i spójność danych |
| `ORDER_FLOW` | Statusy, próbki i prezentacja procesu |
| `LAB_INTEGRATION` | Requesty, odpowiedzi, retry i callbacki |
| `LOGS` | Błędy techniczne i dane potrzebne do analizy logów |
| `PERFORMANCE` | Kontrolowane pogorszenie wybranych operacji |

Dokładne błędy, warunki i oczekiwane zachowanie będą opisane w osobnym, wewnętrznym katalogu. Katalog nie jest częścią dokumentacji produktowej.

## 11. Logi

MVP generuje ustrukturyzowane logi dla:

- uwierzytelnienia;
- operacji na pacjentach;
- tworzenia i zmiany zlecenia;
- rejestracji próbki;
- wysłania do laboratorium;
- odpowiedzi laboratorium;
- retry i timeoutów;
- callbacków;
- zmian statusu;
- importu i eksportu;
- błędów aplikacji.

Każdy wpis zawiera co najmniej:

- timestamp w UTC;
- poziom `INFO`, `WARN` albo `ERROR`;
- nazwę zdarzenia;
- `correlationId`;
- opcjonalnie `workspaceId`, `userId`, `patientId`, `orderId`, `sampleId`, `eventId`;
- kod błędu;
- komunikat techniczny.

Logi nie przechowują pełnego PESEL-u, danych kontaktowych, adresu, numeru dokumentu ani wartości wyników.

## 12. Reset i powtarzalność

Reset środowiska:

1. blokuje nowe operacje na czas resetu;
2. usuwa oczekujące zadania laboratorium;
3. odtwarza dane wszystkich workspace’ów;
4. przywraca wybrany preset;
5. ustawia tryb symulatora `SUCCESS`;
6. ustawia pakiet `CLEAN`;
7. zapisuje rezultat resetu w logu technicznym;
8. odblokowuje aplikację.

Reset zakończony częściowo jest traktowany jako błąd i nie udostępnia aplikacji do czasu przywrócenia spójnego stanu.

## 13. Dokumentacja dostępna z aplikacji

MVP publikuje:

- dokumentację produktową pod `/docs`;
- interaktywną dokumentację OpenAPI pod `/api/docs`;
- przykładowe requesty i odpowiedzi;
- przykładowy plik importu CSV;
- opis kodów błędów API.

Materiały wewnętrzne, panel `/admin`, katalog kontrolowanych błędów i instrukcje prowadzenia nie są publikowane.

## 14. Wymagania niefunkcjonalne MVP

- Aplikacja obsługuje jednoczesną pracę co najmniej 15 użytkowników.
- Dane workspace’ów są logicznie odseparowane.
- Stan zmieniany przez `/admin` obowiązuje wszystkich użytkowników najpóźniej przy kolejnym requeście.
- Standardowe odczyty spełniają limit p95 poniżej 800 ms w trybie `CLEAN`.
- Standardowe zapisy spełniają limit p95 poniżej 1200 ms w trybie `CLEAN`.
- Operacje asynchroniczne nie blokują requestu użytkownika.
- Import, reset i zmiany statusów są atomowe.
- API zwraca jednolity format błędów.
- Wszystkie daty w API są zapisywane w UTC.
- Widoki są używalne na ekranie laptopa i typowym monitorze; dedykowana aplikacja mobilna nie jest wymagana.
- Cały interfejs użytkownika jest dostępny w języku polskim.
- Aplikacja nie korzysta z prawdziwych usług medycznych ani danych osobowych.

## 15. Poza zakresem MVP

- prawdziwa integracja z laboratorium;
- samodzielna rejestracja i odzyskiwanie hasła;
- rozbudowane role i macierz uprawnień;
- edytor katalogu badań;
- umawianie wizyt;
- płatności i rozliczenia;
- e-mail, SMS i push;
- diagnozy i interpretacje wyników;
- natywna aplikacja mobilna;
- integracja z zewnętrznym systemem zgłoszeń błędów;
- konfiguracja błędów dla pojedynczego konta;
- generator danych pacjentów jako osobne narzędzie;
- rozszerzenie Chrome do raportowania błędów.

Dwa ostatnie elementy będą osobnymi produktami pomocniczymi korzystającymi z API Kliniki Debug.

## 16. Kryteria akceptacji MVP

MVP jest gotowe, gdy:

1. Minimum 15 użytkowników może równocześnie pracować na odseparowanych danych.
2. Każdy użytkownik może przejść kompletny proces od utworzenia pacjenta do wyniku.
3. Zlecenie z różnymi materiałami tworzy odpowiednie próbki.
4. Symulator obsługuje wynik kompletny, częściowy, odrzucenie, błędy i timeout.
5. UI i API pokazują spójny stan zlecenia.
6. OpenAPI pozwala wykonać główne operacje bez korzystania z UI.
7. Import i eksport działają dla obu presetów danych.
8. Logi umożliwiają prześledzenie operacji za pomocą `correlationId`.
9. Panel `/admin` globalnie zmienia tryb symulatora i pakiet błędów.
10. Reset przywraca identyczny, znany stan wszystkich workspace’ów.
11. Tryb `CLEAN` działa zgodnie z dokumentacją produktową.
12. Aktywne pakiety błędów są powtarzalne i nie są ujawniane użytkownikom.
13. Aplikacja spełnia wymagania wydajnościowe w trybie `CLEAN`.
14. W systemie nie występują prawdziwe dane osobowe ani medyczne.
15. Interfejs nie zawiera nieprzetłumaczonych etykiet, statusów, walidacji ani komunikatów użytkownika.

## 17. Proponowana kolejność implementacji

### Etap 1 — fundament

- konta i sesje;
- workspace’y i izolacja danych;
- model danych;
- dane katalogowe;
- podstawowy szkielet UI i API.

### Etap 2 — pacjenci

- lista, wyszukiwanie i paginacja;
- formularz i walidacja;
- szczegóły i edycja;
- pacjent niepełnoletni i opiekun.

### Etap 3 — zlecenia i próbki

- tworzenie zlecenia;
- grupowanie materiałów;
- rejestracja próbek;
- cykl statusów;
- historia operacji.

### Etap 4 — laboratorium

- API symulatora;
- wysyłanie asynchroniczne;
- callbacki;
- retry, timeout i idempotencja;
- wyniki i powiadomienia.

### Etap 5 — dane i obserwowalność

- presety danych;
- import i eksport;
- logi i `correlationId`;
- dokumentacja `/docs` i `/api/docs`.

### Etap 6 — sterowanie środowiskiem

- panel `/admin`;
- globalne tryby symulatora;
- reset środowiska;
- monitoring stanu komponentów.

### Etap 7 — kontrolowane błędy

- mechanizm flag;
- wewnętrzny katalog błędów;
- początkowe pakiety;
- weryfikacja przywracania trybu `CLEAN`.

## 18. Następny dokument

Po zaakceptowaniu specyfikacji MVP należy przygotować:

> `klinika-debug-architektura-techniczna.md`

Dokument powinien wybrać technologie, sposób wdrożenia, model danych, mechanizm zadań asynchronicznych, sposób przechowywania logów, zabezpieczenie `/admin` oraz strategię testów i bramek jakości.
