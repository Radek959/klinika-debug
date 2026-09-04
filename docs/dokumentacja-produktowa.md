# Klinika Debug — dokumentacja produktowa

**Wersja dokumentu:** 1.1  
**Status:** zaakceptowana  
**Produkt:** Klinika Debug

## 1. Cel dokumentu

Dokument opisuje funkcje, procesy i reguły biznesowe systemu Klinika Debug. Jest źródłem wiedzy o oczekiwanym zachowaniu aplikacji oraz integracji z zewnętrznym laboratorium.

Dokumentacja dotyczy środowiska demonstracyjnego. Wszystkie dane pacjentów, personelu, zleceń i wyników są syntetyczne. System nie jest przeznaczony do przechowywania prawdziwych danych medycznych ani podejmowania decyzji dotyczących zdrowia.

## 2. Opis produktu

Klinika Debug jest systemem używanym przez personel fikcyjnej placówki medycznej do:

- rejestrowania i wyszukiwania pacjentów;
- tworzenia zleceń badań laboratoryjnych;
- rejestrowania pobrania materiału;
- wysyłania zleceń do zewnętrznego laboratorium;
- śledzenia statusu realizacji zlecenia;
- odbierania i prezentowania wyników;
- przeglądania historii operacji wykonanych na zleceniu.

System nie wykonuje badań samodzielnie. Realizacja badania jest obsługiwana przez zewnętrzne laboratorium komunikujące się z Kliniką Debug przez API.

### 2.1. Język aplikacji

Interfejs Kliniki Debug jest dostępny w języku polskim. Dotyczy to w szczególności:

- nawigacji, nazw ekranów, etykiet pól i przycisków;
- komunikatów walidacyjnych i komunikatów błędów;
- powiadomień i potwierdzeń operacji;
- nazw statusów prezentowanych użytkownikowi;
- dokumentacji produktowej i opisów w dokumentacji OpenAPI.

Techniczne nazwy pól API, endpointów, kodów błędów i wartości enum pozostają w języku angielskim. Interfejs prezentuje ich polskie odpowiedniki. Przełączanie języka nie jest dostępne.

## 3. Zakres systemu

### 3.1. Funkcje objęte zakresem

- logowanie użytkownika;
- obsługa pacjentów;
- katalog badań;
- tworzenie i edytowanie zleceń;
- obsługa wymaganych próbek;
- integracja z laboratorium;
- prezentowanie statusów i wyników;
- historia zmian zlecenia;
- import pacjentów z pliku CSV;
- eksport danych do CSV i JSON;
- interfejs REST API;
- dokumentacja OpenAPI.

### 3.2. Funkcje poza zakresem

- umawianie wizyt;
- rozliczenia z pacjentem lub ubezpieczycielem;
- wystawianie recept i skierowań;
- interpretacja medyczna wyników;
- proponowanie diagnozy lub leczenia;
- przechowywanie obrazów diagnostycznych;
- komunikacja z rzeczywistymi systemami medycznymi.

## 4. Organizacja danych

Każde konto jest przypisane do jednej placówki. Dane placówek są od siebie odseparowane. Użytkownik może przeglądać i modyfikować wyłącznie pacjentów, zlecenia, próbki, wyniki i historię swojej placówki.

Katalog badań jest wspólny dla wszystkich placówek i dostępny tylko do odczytu.

## 5. Użytkownicy systemu

W procesie występują dwie odpowiedzialności biznesowe:

| Persona | Typowe czynności |
|---|---|
| Lekarz | Wyszukanie pacjenta, wybór badań, utworzenie zlecenia, przegląd wyników |
| Pielęgniarka | Rejestracja danych pacjenta, potwierdzenie pobrania materiału, wysłanie zlecenia do laboratorium |

Aktualna wersja systemu posiada jeden profil uprawnień: **personel placówki**. Każde konto z tym profilem może wykonać wszystkie czynności dostępne lekarzowi i pielęgniarce.

System zapisuje identyfikator użytkownika wykonującego każdą operację. Informacja jest widoczna w historii zlecenia.

## 6. Słownik pojęć

| Pojęcie | Znaczenie |
|---|---|
| Pacjent | Osoba, dla której tworzone jest zlecenie badania |
| Zlecenie | Zestaw jednego lub wielu badań zleconych dla jednego pacjenta |
| Badanie | Pozycja z katalogu określająca analizę wykonywaną przez laboratorium |
| Parametr | Pojedyncza wartość zwracana w wyniku badania |
| Materiał | Rodzaj materiału wymagany do wykonania badania, np. krew EDTA, surowica lub mocz |
| Próbka | Konkretna porcja materiału pobrana od pacjenta i przypisana do zlecenia |
| Laboratorium | Zewnętrzny system przyjmujący zlecenia i zwracający rezultaty przez API |
| Wynik częściowy | Rezultat zawierający odpowiedź tylko dla części badań ze zlecenia |
| Correlation ID | Identyfikator łączący operację w aplikacji, komunikację API i wpisy w logach |
| Workspace | Odseparowany obszar danych jednej placówki |

## 7. Model domenowy

### 7.1. Pacjent

Pacjent zawiera: `patientId`, imię, nazwisko, typ identyfikatora, PESEL albo numer dokumentu, datę urodzenia, płeć, obywatelstwo, telefon, e-mail, adres zamieszkania, opcjonalne dane opiekuna oraz daty utworzenia i modyfikacji.

### 7.2. Zlecenie

Zlecenie zawiera: `orderId`, identyfikator pacjenta, listę badań, priorytet, dane dodatkowe wymagane przez badania, listę próbek, status, identyfikator zewnętrzny, `correlationId`, daty procesu i historię zmian.

### 7.3. Próbka

Próbka zawiera: `sampleId`, kod kreskowy, rodzaj materiału, czas pobrania, identyfikator użytkownika rejestrującego pobranie, status oraz opcjonalną przyczynę odrzucenia.

### 7.4. Wynik

Wynik zawiera: kod badania, kod parametru, wartość liczbową albo tekstową, jednostkę, opcjonalny zakres referencyjny, oznaczenie `LOW`, `NORMAL`, `HIGH` albo `NOT_APPLICABLE`, czas wykonania i status.

Zakres referencyjny pochodzi z odpowiedzi laboratorium. Klinika Debug nie oblicza go samodzielnie.

## 8. Dane pacjenta i walidacja

### 8.1. Identyfikacja pacjenta

Dostępne typy identyfikatora:

- `PESEL` — dla pacjenta posiadającego numer PESEL;
- `OTHER_DOCUMENT` — dla pacjenta bez numeru PESEL.

### 8.2. Reguły dla numeru PESEL

- PESEL składa się z dokładnie 11 cyfr.
- Suma kontrolna i zakodowana data urodzenia muszą być prawidłowe.
- Data urodzenia i płeć w formularzu muszą być zgodne z numerem PESEL.
- PESEL jest unikalny w obrębie placówki.

### 8.3. Pacjent bez numeru PESEL

Wymagane są: rodzaj dokumentu, numer dokumentu, kraj wydania, data urodzenia i płeć. Połączenie rodzaju dokumentu, numeru i kraju wydania musi być unikalne w obrębie placówki.

### 8.4. Pozostałe reguły

- Imię i nazwisko są wymagane i mogą zawierać od 2 do 60 znaków.
- Dozwolone są polskie znaki, spacje, apostrof i łącznik.
- Wymagany jest przynajmniej jeden sposób kontaktu: telefon albo e-mail.
- Polski telefon może zostać podany jako dziewięć cyfr albo z prefiksem `+48`.
- Dla pacjenta poniżej 18 lat wymagane są imię, nazwisko i sposób kontaktu do opiekuna.
- Pacjenta posiadającego zlecenia nie można usunąć; można oznaczyć go jako nieaktywnego.

## 9. Katalog badań

Każde badanie posiada kod, nazwę, opis, wymagany materiał, listę parametrów, wymagane potwierdzenia, przewidywany czas realizacji i status aktywności.

| Kod | Badanie | Materiał | Dodatkowy warunek | Czas realizacji |
|---|---|---|---|---|
| `MORF` | Morfologia krwi | Krew EDTA | Brak | 5 minut |
| `CRP` | CRP | Surowica | Brak | 5 minut |
| `TSH` | TSH | Surowica | Brak | 5 minut |
| `GLU` | Glukoza | Surowica | Potwierdzenie przygotowania pacjenta | 5 minut |
| `URINE` | Badanie ogólne moczu | Mocz | Brak | 5 minut |

Wszystkie wyniki i zakresy w środowisku demonstracyjnym są syntetyczne i nie służą do interpretacji medycznej.

Badania nieaktywnego nie można dodać do nowego zlecenia. Dezaktywacja nie zmienia istniejących zleceń.

## 10. Tworzenie zlecenia

- Zlecenie dotyczy dokładnie jednego aktywnego pacjenta.
- Musi zawierać co najmniej jedno aktywne badanie.
- Tego samego badania nie można dodać więcej niż raz.
- Dostępne priorytety to `ROUTINE` oraz `URGENT`.
- Pola dodatkowe wymagane przez wybrane badania muszą zostać uzupełnione.
- Badania wymagające tego samego materiału są grupowane w jednej próbce.
- Różne materiały powodują utworzenie osobnych próbek.
- Zmiana badań w statusie `DRAFT` ponownie wylicza wymagane próbki.
- Zlecenie można edytować wyłącznie w statusie `DRAFT`.
- Zarejestrowanie pierwszej z wymaganych próbek zmienia status zlecenia na `SAMPLE_COLLECTION_IN_PROGRESS` i blokuje zmianę pacjenta oraz badań.

Przykład: `CRP`, `TSH` i `URINE` wymagają dwóch próbek — surowicy oraz moczu.

## 11. Obsługa próbek

| Status | Znaczenie |
|---|---|
| `REQUIRED` | System ustalił, że próbka jest potrzebna |
| `COLLECTED` | Zarejestrowano pobranie i kod kreskowy |
| `SENT` | Próbka została wysłana do laboratorium |
| `ACCEPTED` | Laboratorium zaakceptowało próbkę |
| `REJECTED` | Laboratorium odrzuciło próbkę |

Reguły:

- Kod kreskowy jest wymagany i unikalny w obrębie placówki.
- Data pobrania nie może być w przyszłości ani przed utworzeniem zlecenia.
- Zlecenie można wysłać dopiero po zarejestrowaniu wszystkich wymaganych próbek.
- Odrzucenie próbki zawiera kod i opis przyczyny.

## 12. Cykl życia zlecenia

| Status | Znaczenie | Dozwolone kolejne statusy |
|---|---|---|
| `DRAFT` | Zlecenie jest przygotowywane | `SAMPLE_COLLECTION_IN_PROGRESS`, `SAMPLE_COLLECTED` |
| `SAMPLE_COLLECTION_IN_PROGRESS` | Zarejestrowano część wymaganych próbek | `SAMPLE_COLLECTED` |
| `SAMPLE_COLLECTED` | Wszystkie próbki zostały zarejestrowane | `SENT_TO_LAB` |
| `SENT_TO_LAB` | Laboratorium przyjęło zlecenie | `PROCESSING`, `TECHNICAL_ERROR` |
| `PROCESSING` | Trwa realizacja badań | `PARTIAL`, `COMPLETED`, `REJECTED`, `TECHNICAL_ERROR` |
| `PARTIAL` | Odebrano część wyników | `PARTIAL`, `COMPLETED`, `REJECTED`, `TECHNICAL_ERROR` |
| `COMPLETED` | Odebrano komplet wyników | Status końcowy |
| `REJECTED` | Odrzucono wszystkie pozostałe badania | Status końcowy |
| `TECHNICAL_ERROR` | Nie zakończono komunikacji z laboratorium | Ponowienie wysłania albo odbioru |

`SAMPLE_COLLECTION_IN_PROGRESS` jest ustawiany po zarejestrowaniu pierwszej próbki, jeżeli zlecenie wymaga kolejnych. `SAMPLE_COLLECTED` jest ustawiany automatycznie po zarejestrowaniu wszystkich wymaganych próbek.

## 13. Wysłanie zlecenia do laboratorium

Zlecenie można wysłać, gdy ma status `SAMPLE_COLLECTED`, pacjent jest aktywny, wymagane dane są kompletne, a wszystkie próbki mają unikalne kody.

Laboratorium przyjmuje zlecenie asynchronicznie. Poprawne żądanie zwraca HTTP `202 Accepted`, `externalOrderId`, status `ACCEPTED`, `estimatedCompletionAt` i `correlationId`. Odpowiedź `202` nie oznacza wykonania badań.

### 13.1. Idempotencja

- Wysłanie zawiera nagłówek `Idempotency-Key`.
- Ponowienie identycznego żądania z tym samym kluczem wskazuje wcześniej utworzone zlecenie.
- Ten sam klucz z inną treścią zwraca `409 Conflict`.

### 13.2. Ponawianie komunikacji

- Odpowiedzi `400`, `401`, `403`, `409` i `422` nie są automatycznie ponawiane.
- Timeout, `429` oraz `5xx` mogą zostać ponowione maksymalnie trzy razy: po 15, 30 i 60 sekundach.
- Po wyczerpaniu prób zlecenie otrzymuje `TECHNICAL_ERROR`.

## 14. Odbieranie wyników

Laboratorium przekazuje wyniki przez webhook. Wywołanie zawiera `externalOrderId`, `eventId`, `correlationId`, status, zakończone badania, parametry wyników, badania oczekujące oraz informacje o odrzuceniu.

- Co najmniej jeden wynik przy niezakończonych pozostałych badaniach ustawia `PARTIAL`.
- Kolejne callbacki mogą uzupełniać wynik częściowy.
- Wcześniej odebrane wyniki pozostają dostępne.
- Ponowne odebranie tego samego `eventId` nie tworzy duplikatów.
- Wyniki są grupowane według badania i pokazują wartość, jednostkę, zakres oraz oznaczenie.
- Brak zakresu jest prezentowany jako „Nie podano”.
- Klinika Debug nie generuje interpretacji ani zaleceń medycznych.

## 15. Historia zlecenia

Historia pokazuje chronologicznie: utworzenie i edycję zlecenia, rejestrację próbek, wysłanie do laboratorium, automatyczne ponowienia, zmiany statusu oraz odebranie wyniku lub błędu.

Każdy wpis zawiera czas, typ zdarzenia, użytkownika albo nazwę systemu i — dla komunikacji integracyjnej — `correlationId`.

## 16. Widoki aplikacji

- **Logowanie** — login, hasło i komunikaty błędów.
- **Panel główny** — liczba zleceń według statusu, ostatnie zmiany, zlecenia oczekujące i błędy techniczne.
- **Pacjenci** — wyszukiwanie, filtrowanie, sortowanie i paginacja.
- **Szczegóły pacjenta** — dane, aktywność, zlecenia i edycja.
- **Nowe zlecenie** — pacjent, badania, materiały, priorytet i wymagane potwierdzenia.
- **Szczegóły zlecenia** — badania, próbki, status, wyniki, historia i dostępne akcje.

## 17. Import i eksport

### 17.1. Import pacjentów z CSV

- Kodowanie UTF-8 i nagłówek w pierwszym wierszu są wymagane.
- Limit jednego pliku wynosi 1000 rekordów.
- Każdy wiersz podlega tym samym regułom co formularz.
- Import jest atomowy: błąd w dowolnym wierszu odrzuca cały plik.
- Raport wskazuje numer wiersza, pole, kod i opis błędu.

### 17.2. Eksport

Listy pacjentów i zleceń można eksportować do CSV lub JSON zgodnie z aktywnymi filtrami. Eksport obejmuje wyłącznie dane bieżącej placówki.

## 18. REST API

- Bazowy adres: `/api/v1`.
- Format: JSON w UTF-8.
- Autoryzacja: token Bearer.
- Daty: ISO 8601 w UTC.
- OpenAPI: `/api/docs`.
- Domyślna strona listy: 20 rekordów; maksymalna: 100.

| Metoda | Endpoint | Zastosowanie |
|---|---|---|
| `POST` | `/patients` | Utworzenie pacjenta |
| `GET` | `/patients` | Lista i wyszukiwanie pacjentów |
| `GET` | `/patients/{patientId}` | Szczegóły pacjenta |
| `PATCH` | `/patients/{patientId}` | Aktualizacja pacjenta |
| `POST` | `/patients/import` | Import CSV |
| `GET` | `/tests` | Katalog badań |
| `POST` | `/orders` | Utworzenie zlecenia |
| `GET` | `/orders` | Lista zleceń |
| `GET` | `/orders/{orderId}` | Szczegóły zlecenia |
| `PATCH` | `/orders/{orderId}` | Edycja wersji roboczej |
| `POST` | `/orders/{orderId}/samples` | Rejestracja próbek |
| `POST` | `/orders/{orderId}/send` | Wysłanie do laboratorium |
| `POST` | `/integrations/lab/results` | Webhook laboratorium |
| `GET` | `/orders/{orderId}/history` | Historia zlecenia |
| `GET` | `/exports/patients` | Eksport pacjentów |
| `GET` | `/exports/orders` | Eksport zleceń |

## 19. Format błędów API

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "pesel",
        "code": "INVALID_CHECKSUM",
        "message": "PESEL checksum is invalid"
      }
    ],
    "correlationId": "c5f35d0d-6c50-44ee-86e0-9aa6a2446c3d"
  }
}
```

| HTTP | Zastosowanie |
|---|---|
| `200` | Poprawny odczyt lub aktualizacja |
| `201` | Utworzenie zasobu |
| `202` | Przyjęcie operacji asynchronicznej |
| `400` | Niepoprawna składnia |
| `401` | Brak uwierzytelnienia |
| `404` | Brak zasobu albo zasób innej placówki |
| `409` | Konflikt lub duplikat |
| `422` | Naruszenie reguły biznesowej |
| `429` | Przekroczony limit |
| `500` | Nieoczekiwany błąd systemu |
| `503` | Niedostępność integracji |

## 20. Logi i identyfikacja operacji

- Każdy request otrzymuje `correlationId`.
- Poprawny `X-Correlation-ID` klienta jest zachowywany; w innym przypadku system generuje identyfikator.
- `correlationId` wraca w nagłówku odpowiedzi i treści błędu.
- Logi integracyjne zawierają identyfikatory zlecenia, próbki i zdarzenia.
- Logi nie zawierają pełnego PESEL-u, dokumentu, adresu, kontaktu ani wartości wyników.
- PESEL jest maskowany do formatu `******12345`.

## 21. Wymagania niefunkcjonalne

- 95% odczytów powinno trwać krócej niż 800 ms.
- 95% zapisów powinno trwać krócej niż 1200 ms, bez czasu laboratorium.
- System obsługuje co najmniej 50 aktywnych użytkowników.
- Limit standardowy wynosi 120 requestów na minutę na konto.
- Po przekroczeniu limitu API zwraca `429` i `Retry-After`.
- Zapisy oraz importy są transakcyjne.
- Ponowione żądania integracyjne nie tworzą duplikatów.
- Interfejs przelicza czas z UTC na strefę przeglądarki.

## 22. Bezpieczeństwo danych

- Workspace wynika z tokenu i nie jest przyjmowany jako parametr requestu.
- Próba odczytania zasobu innej placówki zwraca `404`.
- Eksport obejmuje wyłącznie bieżący workspace.
- Hasła nie są zwracane przez API ani zapisywane w logach.
- Sesja wygasa po 60 minutach bezczynności.

## 23. Powiadomienia i odświeżanie

- Interfejs odświeża zlecenia w `SENT_TO_LAB`, `PROCESSING` i `PARTIAL` co 10 sekund.
- Dostępne jest ręczne odświeżenie.
- Wynik kompletny, częściowy, odrzucenie i błąd techniczny tworzą powiadomienie.
- Powiadomienie zawiera identyfikator zlecenia, typ i czas, ale nie zawiera wartości medycznych.

## 24. Przykładowy proces

1. Użytkownik wyszukuje pacjenta po PESEL-u i w razie potrzeby tworzy rekord.
2. Dodaje `CRP`, `TSH` i `URINE`.
3. System wymaga próbki surowicy i moczu.
4. Użytkownik rejestruje obie próbki; zlecenie przechodzi do `SAMPLE_COLLECTED`.
5. Laboratorium odpowiada `202 Accepted`; zlecenie przechodzi do `SENT_TO_LAB`.
6. Po rozpoczęciu realizacji status zmienia się na `PROCESSING`.
7. Wyniki `CRP` i `TSH` ustawiają `PARTIAL`.
8. Wynik `URINE` kończy zlecenie statusem `COMPLETED`.
9. Pełna historia pozostaje dostępna w szczegółach zlecenia.
