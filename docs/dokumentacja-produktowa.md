# Klinika Debug — dokumentacja produktowa

**Wersja dokumentu:** 2.0  
**Status:** zaakceptowana dla Workshop MVP  
**Produkt:** Klinika Debug

## 1. Cel dokumentu

Dokument opisuje zachowanie Kliniki Debug widoczne dla użytkownika oraz reguły biznesowe potrzebne do pracy z aplikacją.

Jest źródłem prawdy dla uczestnika szkolenia podczas analizy wymagań, projektowania testów, generowania danych, pracy z API i raportowania błędów.

Dokumentacja opisuje wyłącznie oczekiwane, poprawne zachowanie produktu. Nie opisuje wewnętrznych narzędzi prowadzącego ani sposobu przygotowywania scenariuszy szkoleniowych.

Klinika Debug jest środowiskiem demonstracyjnym. Wszystkie dane pacjentów, personelu, zleceń i wyników są syntetyczne. System nie jest przeznaczony do przechowywania prawdziwych danych medycznych ani podejmowania decyzji dotyczących zdrowia.

## 2. Opis produktu

Klinika Debug jest systemem używanym przez personel fikcyjnej placówki medycznej do:

- rejestrowania i wyszukiwania pacjentów;
- tworzenia i edytowania zleceń badań laboratoryjnych;
- rejestrowania pobrania materiału;
- wysyłania zleceń do zewnętrznego laboratorium;
- śledzenia statusu realizacji zlecenia;
- odbierania i prezentowania wyników;
- przeglądania historii operacji wykonanych na zleceniu;
- diagnozowania problemów przy pomocy REST API i `correlationId`.

System nie wykonuje badań samodzielnie. Realizacja badania jest obsługiwana przez zewnętrzne laboratorium komunikujące się z Kliniką Debug przez API.

### 2.1. Język aplikacji

Interfejs Kliniki Debug jest dostępny w języku polskim. Dotyczy to w szczególności:

- nawigacji, nazw ekranów, etykiet pól i przycisków;
- komunikatów walidacyjnych i komunikatów błędów;
- nazw statusów prezentowanych użytkownikowi;
- historii operacji;
- opisów w dokumentacji OpenAPI.

Techniczne nazwy pól API, endpointów, kodów błędów i wartości enum pozostają w języku angielskim. Interfejs prezentuje ich polskie odpowiedniki.

## 3. Zakres Workshop MVP

### 3.1. Funkcje objęte zakresem

- logowanie użytkownika `STAFF`;
- izolacja danych placówek;
- obsługa pacjentów;
- katalog badań;
- tworzenie i edytowanie zleceń w `DRAFT`;
- obsługa wymaganych próbek;
- integracja z laboratorium;
- prezentowanie statusów i wyników;
- wyniki częściowe;
- odrzucenie próbek;
- błędy walidacji laboratorium;
- obsługa 429, 503 i timeoutów;
- automatyczne ponawianie komunikacji;
- historia operacji zlecenia;
- `correlationId`;
- REST API;
- dokumentacja OpenAPI.

### 3.2. Funkcje poza zakresem

Workshop MVP nie obejmuje:

- umawiania wizyt;
- rozliczeń z pacjentem lub ubezpieczycielem;
- recept i skierowań;
- interpretacji medycznej wyników;
- proponowania diagnozy lub leczenia;
- komunikacji z rzeczywistymi systemami medycznymi;
- samodzielnej rejestracji kont;
- resetowania hasła przez e-mail;
- importu pacjentów z CSV;
- eksportu danych do CSV lub JSON;
- systemu powiadomień użytkownika;
- rozbudowanego dashboardu analitycznego;
- wbudowanej wyszukiwarki logów.

## 4. Organizacja danych

Każde konto `STAFF` jest przypisane do dokładnie jednej placówki (`workspace`).

Dane placówek są od siebie odseparowane. Użytkownik może przeglądać i modyfikować wyłącznie pacjentów, zlecenia, próbki, wyniki i historię swojej placówki.

Katalog badań jest wspólny dla wszystkich placówek i dostępny tylko do odczytu.

Identyfikatory zasobów z innego workspace'u nie mogą umożliwiać dostępu do cudzych danych.

## 5. Użytkownicy systemu

W procesie można wyróżnić dwie odpowiedzialności biznesowe:

| Persona | Typowe czynności |
|---|---|
| Lekarz | wyszukanie pacjenta, wybór badań, utworzenie zlecenia, przegląd wyników |
| Pielęgniarka | rejestracja pacjenta, pobranie materiału, wysłanie zlecenia do laboratorium |

Aktualna wersja systemu posiada jeden profil uprawnień: **personel placówki (`STAFF`)**. Każde konto z tym profilem może wykonać cały główny proces.

System zapisuje użytkownika wykonującego operację, gdy jest to istotne dla historii procesu.

## 6. Słownik pojęć

| Pojęcie | Znaczenie |
|---|---|
| Pacjent | osoba, dla której tworzone jest zlecenie |
| Zlecenie | zestaw jednego lub wielu badań dla jednego pacjenta |
| Badanie | pozycja katalogu określająca analizę wykonywaną przez laboratorium |
| Parametr | pojedyncza wartość zwracana w wyniku badania |
| Materiał | rodzaj materiału wymagany do wykonania badania, np. krew EDTA, surowica lub mocz |
| Próbka | konkretna porcja materiału pobrana od pacjenta i przypisana do zlecenia |
| Laboratorium | zewnętrzny system przyjmujący zlecenia i zwracający rezultaty |
| Wynik częściowy | wynik dotyczący tylko części badań ze zlecenia |
| `correlationId` | identyfikator pozwalający powiązać operację, odpowiedź API, historię i logi |
| Workspace | odseparowany obszar danych jednej placówki |

## 7. Pacjent

Pacjent zawiera m.in.:

- imię i nazwisko;
- PESEL albo dane innego dokumentu;
- datę urodzenia;
- płeć;
- obywatelstwo;
- telefon i/lub e-mail;
- adres;
- opcjonalne dane opiekuna;
- status aktywności.

### 7.1. Identyfikacja pacjenta

Dostępne są dwa typy identyfikatora:

- `PESEL`;
- `OTHER_DOCUMENT`.

### 7.2. Reguły PESEL

- PESEL składa się z dokładnie 11 cyfr.
- Suma kontrolna musi być prawidłowa.
- Data urodzenia zakodowana w PESEL-u musi być prawidłowa.
- Data urodzenia formularza musi być zgodna z PESEL-em.
- Płeć formularza musi być zgodna z PESEL-em.
- PESEL jest unikalny w obrębie workspace'u.

### 7.3. Pacjent bez PESEL-u

Dla `OTHER_DOCUMENT` wymagane są:

- rodzaj dokumentu;
- numer dokumentu;
- kraj wydania;
- data urodzenia;
- płeć.

Połączenie rodzaju dokumentu, numeru i kraju wydania musi być unikalne w obrębie workspace'u.

### 7.4. Pozostałe reguły

- Imię i nazwisko są wymagane i mają od 2 do 60 znaków.
- Dozwolone są polskie znaki, spacje, apostrof i łącznik.
- Wymagany jest co najmniej jeden sposób kontaktu: telefon albo e-mail.
- Polski numer telefonu może zostać zapisany jako dziewięć cyfr albo z prefiksem `+48`.
- Dla pacjenta poniżej 18 lat wymagane są dane opiekuna i co najmniej jeden sposób kontaktu z opiekunem.
- Pacjenta posiadającego zlecenia nie usuwa się fizycznie; można oznaczyć go jako nieaktywnego.
- Nowego zlecenia nie można utworzyć dla nieaktywnego pacjenta.

## 8. Katalog badań

Workshop MVP zawiera pięć badań:

| Kod | Badanie | Materiał | Dodatkowy warunek |
|---|---|---|---|
| `MORF` | Morfologia krwi | Krew EDTA | brak |
| `CRP` | CRP | Surowica | brak |
| `TSH` | TSH | Surowica | brak |
| `GLU` | Glukoza | Surowica | potwierdzenie przygotowania pacjenta |
| `URINE` | Badanie ogólne moczu | Mocz | brak |

Katalog badań jest wspólny dla wszystkich workspace'ów i tylko do odczytu dla użytkownika `STAFF`.

Badania nieaktywnego nie można dodać do nowego zlecenia. Dezaktywacja badania nie zmienia wcześniej utworzonych zleceń.

Wszystkie wyniki i zakresy referencyjne są syntetyczne.

## 9. Tworzenie i edycja zlecenia

Zlecenie:

- dotyczy dokładnie jednego aktywnego pacjenta;
- musi zawierać co najmniej jedno aktywne badanie;
- nie może zawierać tego samego badania więcej niż raz;
- ma priorytet `ROUTINE` albo `URGENT`;
- wymaga uzupełnienia pól dodatkowych wymaganych przez wybrane badania;
- automatycznie wylicza wymagane rodzaje próbek.

Badania wymagające tego samego materiału są grupowane w jednej próbce.

Przykład: `CRP`, `TSH` i `URINE` wymagają dwóch próbek: surowicy i moczu.

Zlecenie można edytować wyłącznie w statusie `DRAFT`.

Zmiana badań w `DRAFT` powoduje ponowne wyliczenie wymaganych próbek.

Po zarejestrowaniu pierwszej próbki nie można zmienić pacjenta ani listy badań.

## 10. Rejestracja próbek

Dla każdej wymaganej próbki użytkownik podaje:

- rodzaj materiału;
- kod kreskowy;
- datę i czas pobrania.

Reguły:

- kod kreskowy jest wymagany i unikalny w workspace'ie;
- czas pobrania nie może być w przyszłości;
- czas pobrania nie może być wcześniejszy niż utworzenie zlecenia;
- pierwsza z kilku próbek zmienia status zlecenia na `SAMPLE_COLLECTION_IN_PROGRESS`;
- zarejestrowanie wszystkich wymaganych próbek ustawia `SAMPLE_COLLECTED`;
- zlecenie można wysłać do laboratorium dopiero po zarejestrowaniu wszystkich wymaganych próbek.

Statusy próbki:

| Status | Znaczenie |
|---|---|
| `REQUIRED` | próbka jest wymagana |
| `COLLECTED` | zarejestrowano pobranie |
| `SENT` | próbka została wysłana |
| `ACCEPTED` | laboratorium zaakceptowało próbkę |
| `REJECTED` | laboratorium odrzuciło próbkę |

## 11. Cykl życia zlecenia

| Status | Znaczenie |
|---|---|
| `DRAFT` | przygotowanie zlecenia |
| `SAMPLE_COLLECTION_IN_PROGRESS` | zarejestrowano część wymaganych próbek |
| `SAMPLE_COLLECTED` | wszystkie wymagane próbki są gotowe |
| `SENT_TO_LAB` | laboratorium przyjęło zlecenie |
| `PROCESSING` | trwa realizacja |
| `PARTIAL` | odebrano część wyników |
| `COMPLETED` | odebrano komplet wyników |
| `REJECTED` | zlecenie zakończyło się odrzuceniem wymaganych próbek/badań |
| `TECHNICAL_ERROR` | komunikacja z laboratorium nie zakończyła się poprawnie po wymaganych ponowieniach |

Nie każde przejście pomiędzy statusami jest dozwolone. Status jest zmieniany przez operacje biznesowe, a nie przez ręczną edycję użytkownika.

## 12. Wysłanie zlecenia do laboratorium

Zlecenie można wysłać, gdy:

- ma status `SAMPLE_COLLECTED`;
- pacjent jest aktywny;
- wszystkie wymagane dane są kompletne;
- wszystkie próbki są zarejestrowane.

Akcja `POST /api/v1/orders/{orderId}/send` jest idempotentna.

### 12.1. Idempotencja

- Wysłanie wykorzystuje `Idempotency-Key`.
- Ponowienie tego samego żądania z tym samym kluczem nie tworzy drugiej wysyłki.
- Ten sam klucz z inną treścią zwraca `409 Conflict`.

### 12.2. Poprawna wysyłka

Aktualny kontrakt API zwraca HTTP `200 OK` po poprawnym przyjęciu operacji wysłania przez Klinikę Debug.

Odpowiedź zawiera stan zlecenia i dane integracyjne potrzebne do dalszego śledzenia procesu.

Przyjęcie wysyłki nie oznacza, że wszystkie badania są już wykonane.

### 12.3. Odrzucenie walidacyjne laboratorium

Laboratorium może odrzucić wysyłkę z powodu walidacji. Wtedy API zwraca `422`, zlecenie pozostaje w stanie umożliwiającym ponowną próbę, a odpowiedź może zawierać błędy pól.

### 12.4. Rate limit

Laboratorium może zwrócić `429 Too Many Requests`.

Klinika Debug:

- zwraca `Retry-After`;
- zapisuje stan oczekiwania na automatyczne ponowienie;
- nie oznacza przejściowego 429 jako `TECHNICAL_ERROR`;
- automatycznie ponawia wysyłkę.

### 12.5. Błąd serwera i timeout

Komunikacja może zakończyć się:

- `503 Service Unavailable`;
- `504 Gateway Timeout`.

Dla błędów przejściowych aplikacja korzysta z automatycznych ponowień.

### 12.6. Harmonogram retry

Dla retryowalnych błędów wysyłka może być ponowiona maksymalnie trzy razy, z opóźnieniami:

1. 15 sekund;
2. 30 sekund;
3. 60 sekund.

Po wyczerpaniu prób zlecenie otrzymuje `TECHNICAL_ERROR`.

Ponowienia muszą być odporne na duplikację i restart procesu.

## 13. Wyniki laboratorium

Laboratorium przekazuje wyniki asynchronicznie.

Możliwe są m.in.:

- komplet wyników;
- wynik częściowy, a następnie komplet;
- odrzucenie jednej lub wielu próbek.

Wynik zawiera kod badania, parametry, wartości, jednostki, opcjonalne zakresy referencyjne i oznaczenia typu `LOW`, `NORMAL`, `HIGH` albo `NOT_APPLICABLE`.

Klinika Debug nie interpretuje medycznie wyników.

### 13.1. Wynik częściowy

Jeżeli laboratorium zwróci wyniki tylko dla części badań:

- ukończone wyniki są widoczne;
- pozostałe badania pozostają oczekujące;
- zlecenie otrzymuje `PARTIAL`;
- późniejsza odpowiedź może zakończyć zlecenie jako `COMPLETED`.

### 13.2. Odrzucenie próbki

Odrzucenie zawiera kod i syntetyczny opis przyczyny.

Badania zależne od odrzuconego materiału mogą otrzymać status `REJECTED`, natomiast poprawnie wykonane wcześniej wyniki pozostają widoczne.

## 14. Historia operacji

Szczegóły zlecenia zawierają historię najważniejszych zdarzeń biznesowych, m.in.:

- utworzenie i edycję zlecenia;
- rejestrację próbek;
- wysłanie do laboratorium;
- przyjęcie przez laboratorium;
- wyniki częściowe i końcowe;
- odrzucenie;
- rate limit;
- timeout;
- automatyczne retry;
- błąd techniczny.

Historia pokazuje polskie opisy i nie ujawnia technicznej konfiguracji środowiska.

## 15. Correlation ID

Operacje związane z integracją wykorzystują `correlationId`.

Identyfikator może występować w:

- odpowiedzi API;
- nagłówku odpowiedzi;
- historii zlecenia;
- materiałach logowych.

`correlationId` służy do łączenia zdarzeń dotyczących tej samej operacji i może być używany podczas diagnostyki.

Nie należy traktować samego `correlationId` jako przyczyny błędu ani informacji biznesowej.

## 16. REST API i OpenAPI

Główne operacje aplikacji są dostępne przez REST API pod `/api/v1`.

Dokumentacja OpenAPI jest dostępna pod `/api/docs`.

Uwierzytelnione endpointy korzystają z tokenu konta `STAFF`.

API używa spójnego formatu błędu z kodem technicznym, komunikatem i `correlationId`, jeśli dotyczy.

Dokumentacja OpenAPI jest częścią źródła prawdy technicznej podczas pracy z API.

## 17. Dane demonstracyjne

Wszystkie dane używane w aplikacji, testach i materiałach szkoleniowych są syntetyczne.

Nie należy wprowadzać:

- prawdziwych danych pacjentów;
- produkcyjnych danych kontaktowych;
- rzeczywistych sekretów;
- prawdziwych danych uwierzytelniających innych systemów.

Wartości wyników mają charakter demonstracyjny i nie mogą być wykorzystywane do interpretacji medycznej.

## 18. Zasada źródła prawdy

W przypadku pracy uczestnika:

1. dokumentacja produktowa opisuje oczekiwane zachowanie biznesowe;
2. OpenAPI opisuje kontrakt techniczny API;
3. rzeczywiste zachowanie aplikacji jest obserwacją wymagającą porównania z dokumentacją;
4. odpowiedź modelu AI nie zastępuje dokumentacji ani dowodów z aplikacji.

Jeżeli dokumentacja nie zawiera odpowiedzi, należy wskazać brak informacji zamiast dopowiadać nieistniejącą regułę.
