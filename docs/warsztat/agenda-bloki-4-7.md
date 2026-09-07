# Klinika Debug — agenda praktycznej części warsztatu „Tester z AI”

**Status:** wersja robocza 1.0  
**Zakres:** bloki 4–7 warsztatu  
**Aplikacja:** Klinika Debug  
**Narzędzia AI:** ChatGPT, Gemini, Claude

## 1. Cel dokumentu

Dokument opisuje modułową agendę praktycznej części warsztatu „Tester z AI”. Ćwiczenia wykorzystują aplikację Klinika Debug jako wspólny, spójny projekt testowy.

Agenda nie narzuca podziału na demonstracje prowadzącego i samodzielną pracę uczestników. Sposób wykonania ćwiczenia może zostać wybrany podczas warsztatu zależnie od dostępnego czasu, tempa grupy i obszarów, które okażą się najbardziej wartościowe.

Dokument nie zawiera:

- odpowiedzi do ćwiczeń;
- instrukcji aktywowania kontrolowanych błędów;
- wewnętrznego katalogu błędów aplikacji;
- instrukcji prowadzenia warsztatu;
- sztywnego podziału ćwiczeń pomiędzy prowadzącego i uczestników.

## 2. Założenia pracy z kontekstem

Warsztat rozpoczynają dokładnie dwa ćwiczenia wykonywane bez dokumentacji produktowej:

1. generowanie przypadków testowych dla ogólnie opisanej aplikacji medycznej;
2. generowanie danych pacjentów dla ogólnie opisanego formularza medycznego.

Następnie oba zadania są powtarzane z plikiem `klinika-debug-dokumentacja-produktowa.md`. Pozwala to porównać odpowiedzi powstałe na podstawie ogólnej wiedzy modelu z odpowiedziami opartymi na rzeczywistych regułach projektu.

Od zakończenia tego porównania wszystkie kolejne ćwiczenia są wykonywane z dokumentacją Kliniki Debug jako obowiązkowym kontekstem.

Dokumentacja jest źródłem prawdy. Odpowiedź modelu nie zastępuje weryfikacji w dokumentacji, aplikacji, OpenAPI ani logach.

## 3. Elastyczny czas realizacji

| Część | Wariant minimalny | Wariant pełny |
|---|---:|---:|
| Eksperyment z kontekstem | 20 min | 30 min |
| Blok 4 — AI w codziennej pracy testera | 35 min | 60 min |
| Blok 5 — generowanie danych i analiza logów | 30 min | 50 min |
| Blok 6 — testowanie API z AI | 40 min | 70 min |
| Blok 7 — skrypty i narzędzia z AI | 45 min | 90 min |
| Podsumowanie | 10 min | 15 min |

Wariant minimalny obejmuje główną ścieżkę każdego bloku. Wariant pełny pozwala wykonać dodatkowe eksperymenty, porównać odpowiedzi modeli i rozbudować tworzone artefakty.

## 4. Materiały potrzebne do ćwiczeń

- działająca aplikacja Klinika Debug;
- konto personelu placówki;
- `klinika-debug-dokumentacja-produktowa.md`;
- dokumentacja OpenAPI Kliniki Debug;
- przykładowe, syntetyczne logi aplikacji;
- przykładowe odpowiedzi API;
- możliwość korzystania przynajmniej z jednego z narzędzi: ChatGPT, Gemini albo Claude;
- Python 3 dla ćwiczenia ze skryptem API;
- przeglądarka Chrome dla ćwiczenia z rozszerzeniem.

Skrypt Python, rozszerzenie Chrome i lokalne narzędzia analityczne są tworzone podczas warsztatu przy pomocy AI albo pozostają lokalnymi artefaktami prowadzącego i uczestników. Repozytorium Kliniki Debug nie przechowuje gotowych implementacji tych narzędzi.

Wszystkie używane dane muszą być syntetyczne. Do modeli AI nie należy przekazywać rzeczywistych danych pacjentów, danych uwierzytelniających ani produkcyjnych sekretów.

---

# 5. Eksperyment otwierający — odpowiedź bez kontekstu i z kontekstem

## 5.1. Ćwiczenie porównawcze 1 — przypadki testowe

### Cel

Pokazanie, że płynna i rozbudowana odpowiedź AI nie musi być zgodna z rzeczywistym produktem.

### Etap A — bez dokumentacji

Przykładowe polecenie:

> Przygotuj przypadki testowe dla aplikacji medycznej, w której personel może dodawać pacjentów i tworzyć zlecenia badań laboratoryjnych.

### Obszary obserwacji

- Czy model przyjmuje nieujawnione założenia?
- Czy wymyśla funkcje, role albo reguły?
- Czy podaje oczekiwane rezultaty, których nie da się potwierdzić?
- Czy uwzględnia zależności pomiędzy pacjentem, badaniem, materiałem i zleceniem?
- Czy wszystkie przypadki da się wykonać w aplikacji?
- Czy wynik ma sensowną priorytetyzację?

### Etap B — z dokumentacją

Do rozmowy zostaje dodany plik `klinika-debug-dokumentacja-produktowa.md`.

Przykładowe polecenie:

> Na podstawie załączonej dokumentacji Kliniki Debug przygotuj przypadki testowe procesu tworzenia zlecenia badań. Przy każdym przypadku wskaż źródłową regułę lub numer sekcji dokumentacji. Nie dopowiadaj funkcji, których dokumentacja nie opisuje. Fakty, założenia i pytania otwarte przedstaw osobno.

### Rezultat

Porównanie obu odpowiedzi pod kątem:

- zgodności z zakresem aplikacji;
- pokrycia reguł biznesowych;
- liczby nieuzasadnionych założeń;
- wykonalności przypadków;
- jakości oczekiwanych rezultatów;
- możliwości prześledzenia odpowiedzi do źródła.

## 5.2. Ćwiczenie porównawcze 2 — dane pacjentów

### Cel

Pokazanie, że dane wyglądające realistycznie mogą być niespójne lub nie spełniać reguł domenowych.

### Etap A — bez dokumentacji

Przykładowe polecenie:

> Przygotuj zestaw danych testowych dla formularza dodawania pacjenta w polskiej aplikacji medycznej. Uwzględnij poprawne i niepoprawne dane.

### Obszary obserwacji

- poprawność sumy kontrolnej PESEL;
- zgodność daty urodzenia z PESEL-em;
- zgodność płci z PESEL-em;
- dane osoby niepełnoletniej;
- wymagania dotyczące opiekuna;
- pacjent bez PESEL-u;
- unikalność danych w placówce;
- zgodność pól z rzeczywistym formularzem.

### Etap B — z dokumentacją

Przykładowe polecenie:

> Korzystając wyłącznie z dokumentacji Kliniki Debug, przygotuj tabelę danych dla pacjentów. Uwzględnij poprawne i niepoprawne rekordy, pacjenta niepełnoletniego z opiekunem oraz pacjenta bez PESEL-u. Dla każdego rekordu podaj cel, oczekiwany rezultat i źródłową regułę. Sprawdź sumę kontrolną PESEL oraz zgodność zakodowanej daty urodzenia i płci.

### Rezultat

Zestaw danych, którego poprawność można zweryfikować za pomocą dokumentacji oraz zachowania aplikacji.

## 5.3. Reguła obowiązująca od tego miejsca

Po zakończeniu dwóch ćwiczeń porównawczych dokumentacja Kliniki Debug jest obowiązkowym kontekstem we wszystkich kolejnych zadaniach.

W dalszych poleceniach warto stosować wspólną instrukcję:

> Korzystaj z załączonej dokumentacji Kliniki Debug jako źródła prawdy. Przy wnioskach wskaż odpowiednią sekcję lub regułę. Oddziel fakty od założeń i pytań otwartych. Jeżeli dokumentacja nie zawiera potrzebnej informacji, napisz to wprost. Nie wymyślaj brakującego zachowania.

---

# 6. Blok 4 — AI w codziennej pracy testera

## 6.1. Mapa zastosowań AI

Blok rozpoczyna przegląd praktycznych zastosowań AI w pracy testera:

1. analiza wymagań;
2. wykrywanie luk i sprzeczności;
3. generowanie pytań do analityka lub Product Ownera;
4. generowanie przypadków testowych;
5. priorytetyzacja testów;
6. analiza ryzyka;
7. określanie zakresu regresji;
8. przygotowanie checklist;
9. projektowanie sesji eksploracyjnych;
10. generowanie i weryfikacja danych testowych;
11. przygotowywanie raportów błędów;
12. komunikacja z developerami i biznesem;
13. analiza odpowiedzi API;
14. analiza logów;
15. tworzenie prostych skryptów i narzędzi.

Lista stanowi mapę możliwości. Nie wszystkie pozycje muszą być osobnym ćwiczeniem.

## 6.2. Ćwiczenie — analiza wymagań i wykrywanie luk

### Cel

Wykorzystanie AI jako asystenta analizy, a nie generatora ostatecznych decyzji produktowych.

### Zakres do wyboru

- dane i walidacja pacjenta;
- katalog badań;
- tworzenie zlecenia;
- obsługa próbek;
- cykl życia zlecenia;
- wysłanie do laboratorium;
- odbieranie wyników.

### Zadanie

AI przygotowuje:

- listę jawnych reguł;
- zależności pomiędzy regułami;
- potencjalne niejasności lub sprzeczności;
- pytania wymagające decyzji biznesowej;
- ryzyka testowe;
- listę informacji, których model nie powinien samodzielnie dopowiadać.

### Weryfikacja

Każdy wniosek należy porównać ze wskazaną sekcją dokumentacji. Pytanie do analityka nie może być przedstawione jako obowiązująca reguła.

## 6.3. Ćwiczenie — przypadki testowe procesu biznesowego

### Cel

Przejście od pojedynczego formularza do testów pełnego procesu.

### Przykładowy proces

> Aktywny pacjent → zlecenie `CRP`, `TSH` i `URINE` → próbka surowicy i moczu → wysłanie do laboratorium → wynik częściowy → wynik kompletny.

### Oczekiwany rezultat

AI przygotowuje:

- happy path;
- przypadki negatywne;
- przypadki graniczne;
- sprawdzenie wymaganych materiałów;
- przejścia statusów;
- potrzebne dane;
- warunki wstępne;
- oczekiwane rezultaty;
- priorytet każdego przypadku;
- odwołanie do dokumentacji.

## 6.4. Ćwiczenie — risk-based testing i minimalna regresja

### Cel

Odejście od generowania dużej liczby równorzędnych przypadków na rzecz wyboru testów chroniących najważniejsze ryzyka.

### Zadanie

Na podstawie wybranego procesu AI:

- identyfikuje ryzyka biznesowe i techniczne;
- ocenia prawdopodobieństwo oraz wpływ;
- proponuje priorytety;
- wybiera minimalny zestaw regresji;
- uzasadnia odrzucenie mniej istotnych przypadków;
- wskazuje założenia wpływające na ocenę.

### Weryfikacja

Ocena ryzyka jest propozycją modelu. Uczestnicy sprawdzają, czy uzasadnienie wynika z dokumentacji i czy model nie utożsamia liczby przypadków z jakością testów.

## 6.5. Ćwiczenie — sesja exploratory testing

### Cel

Przygotowanie konkretnej, ograniczonej czasowo sesji eksploracyjnej.

### Możliwe obszary

- formularz pacjenta;
- pacjent niepełnoletni i opiekun;
- tworzenie zlecenia;
- grupowanie badań według materiału;
- rejestracja próbek;
- oczekiwanie na wynik częściowy i kompletny.

### Rezultat

Karta sesji zawierająca:

- cel;
- zakres i elementy poza zakresem;
- limit czasu;
- ryzyka;
- heurystyki;
- dane testowe;
- pomysły na obserwacje;
- dowody do zebrania;
- kryterium zakończenia.

## 6.6. Ćwiczenie — raport błędu

### Cel

Przekształcenie nieuporządkowanych obserwacji w sprawdzalne zgłoszenie.

### Materiały wejściowe

- zaobserwowane zachowanie aplikacji;
- wykonane kroki;
- screenshot lub nagranie;
- request i response API;
- opcjonalny fragment syntetycznych logów;
- dokumentacja produktowa.

### Rezultat

Raport powinien zawierać:

- jednoznaczny tytuł;
- środowisko;
- warunki wstępne;
- minimalne kroki reprodukcji;
- rzeczywisty rezultat;
- oczekiwany rezultat oparty na dokumentacji;
- częstotliwość;
- dowody;
- propozycję severity i priority z uzasadnieniem;
- pytania lub braki w materiale.

### Weryfikacja

AI nie może wymyślać niewykonanych kroków ani przedstawiać hipotezy technicznej jako potwierdzonej przyczyny.

## 6.7. Ćwiczenie rozszerzające — komunikacja z zespołem

Na podstawie tego samego problemu AI przygotowuje:

- techniczny raport dla developera;
- krótką wiadomość na komunikatorze;
- podsumowanie ryzyka dla Product Ownera;
- informację o wpływie na wydanie.

Porównanie pokazuje, że ten sam fakt należy przedstawić inaczej zależnie od odbiorcy, bez zmiany jego znaczenia.

---

# 7. Blok 5 — generowanie danych i analiza logów

## 7.1. Ćwiczenie — macierz danych testowych pacjentów

### Cel

Przygotowanie różnorodnych, sprawdzalnych danych zamiast przypadkowych rekordów wyglądających realistycznie.

### Zakres danych

- dorosły pacjent z PESEL-em;
- pacjent niepełnoletni z opiekunem;
- pacjent bez PESEL-u;
- poprawne polskie znaki;
- apostrof, łącznik i spacja w imieniu lub nazwisku;
- poprawne warianty telefonu;
- poprawny i niepoprawny e-mail;
- wartości graniczne;
- duplikat PESEL-u;
- duplikat dokumentu w tej samej placówce;
- dane celowo niezgodne z regułami.

### Format rezultatu

Każdy rekord zawiera:

- identyfikator danych;
- cel testu;
- komplet pól;
- oznaczenie `VALID` albo `INVALID`;
- oczekiwany rezultat;
- regułę z dokumentacji;
- informację, jak sprawdzono PESEL.

## 7.2. Ćwiczenie — niezależna weryfikacja danych AI

### Cel

Pokazanie, że dane wygenerowane przez model wymagają sprawdzenia.

### Zadanie

Druga rozmowa albo drugi model otrzymuje dane i zadanie recenzji:

- przeliczenie sum kontrolnych PESEL;
- odczytanie zakodowanej daty urodzenia;
- sprawdzenie zakodowanej płci;
- sprawdzenie pełnoletności;
- sprawdzenie danych opiekuna;
- wykrycie duplikatów;
- porównanie ze strukturą formularza i dokumentacją.

Wyniki ChatGPT, Gemini i Claude mogą zostać porównane bez budowania rankingu modeli. Celem jest ocena odpowiedzi i sposobu weryfikacji.

## 7.3. Ćwiczenie — dane do importu CSV

### Cel

Przygotowanie pliku nadającego się do testowania importu oraz jego atomowości.

### Zakres

AI przygotowuje dane obejmujące:

- poprawne nagłówki;
- kodowanie UTF-8;
- kilka poprawnych rekordów;
- pacjenta niepełnoletniego;
- pacjenta z dokumentem zagranicznym;
- jeden albo kilka kontrolowanych błędów;
- numer wiersza i oczekiwany błąd dla każdego niepoprawnego rekordu.

### Weryfikacja

- zgodność kolumn z aplikacją;
- zgodność rekordów z regułami formularza;
- poprawność znaków diakrytycznych;
- zachowanie limitu pliku;
- odrzucenie całego importu po błędzie dowolnego wiersza;
- zgodność raportu błędów z dokumentacją.

## 7.4. Ćwiczenie — analiza logów z `correlationId`

### Cel

Połączenie informacji rozproszonych pomiędzy requestem, odpowiedzią i logami.

### Materiały

- syntetyczny fragment logów;
- request API;
- response API;
- identyfikator `correlationId`;
- dokumentacja produktowa.

### Zadanie

AI ma:

- odnaleźć zdarzenia należące do jednej operacji;
- ułożyć je chronologicznie;
- wskazać moment wystąpienia błędu;
- oddzielić przyczynę, skutek i hipotezę;
- wskazać brakujące informacje;
- sprawdzić zgodność statusów z dokumentacją;
- wykryć ewentualne ujawnienie pełnego PESEL-u, dokumentu, adresu, kontaktu lub wartości wyników;
- przygotować materiał do raportu błędu.

### Rezultat

Krótka oś zdarzeń, lista potwierdzonych faktów, hipotezy wymagające sprawdzenia i propozycja kolejnych kroków diagnostycznych.

---

# 8. Blok 6 — testowanie API z AI

## 8.1. Ćwiczenie — czytanie OpenAPI z pomocą AI

### Cel

Przełożenie technicznej dokumentacji API na plan testów zrozumiały również dla osoby bez doświadczenia programistycznego.

### Materiały

- dokumentacja produktowa;
- dokumentacja OpenAPI albo wybrany fragment JSON;
- adres środowiska testowego.

### Zadanie

AI:

- opisuje endpointy prostym językiem;
- wskazuje zależności i kolejność ich wywołań;
- rozpoznaje sposób uwierzytelnienia;
- wymienia wymagane nagłówki i pola;
- podaje możliwe statusy HTTP;
- przygotowuje przykładowe requesty;
- porównuje OpenAPI z dokumentacją produktową;
- wskazuje rozbieżności oraz brakujące informacje bez samodzielnego ustalania oczekiwanego zachowania.

## 8.2. Ćwiczenie — pełny proces przez API

### Przykładowa sekwencja

1. Logowanie.
2. Utworzenie albo wyszukanie pacjenta.
3. Pobranie katalogu badań.
4. Utworzenie zlecenia.
5. Pobranie szczegółów zlecenia.
6. Rejestracja wymaganych próbek.
7. Wysłanie zlecenia do laboratorium.
8. Sprawdzanie statusu.
9. Odebranie wyniku częściowego, kompletnego albo błędu.

### Możliwe formaty rezultatu

- instrukcja wykonania w Swagger UI;
- komendy `curl`;
- kolekcja Postmana;
- prosty skrypt JavaScript;
- prosty skrypt Python.

### Weryfikacja

- zgodność pól z OpenAPI;
- prawidłowe wykorzystanie tokenu;
- brak sekretów zapisanych w artefakcie;
- prawidłowa kolejność operacji;
- zgodność statusów z dokumentacją;
- wykorzystanie identyfikatorów otrzymanych w poprzednich odpowiedziach.

## 8.3. Ćwiczenie — negatywne testy API

Zakres do wyboru:

- brak albo niepoprawny token;
- niepoprawne dane pacjenta;
- pacjent nieaktywny;
- pacjent albo zlecenie z innego workspace’u;
- pusta lista badań;
- powtórzone badanie;
- badanie nieaktywne;
- brak wymaganego potwierdzenia dla `GLU`;
- zduplikowany kod próbki;
- data pobrania w przyszłości;
- niedozwolone przejście statusu;
- powtórzenie żądania z `Idempotency-Key`;
- ten sam klucz idempotencji z innym payloadem;
- odpowiedzi `409`, `422`, `429`, `500` i `503`.

AI przygotowuje request, oczekiwany status HTTP, oczekiwany kod błędu, wymagane dane oraz źródłową regułę.

## 8.4. Ćwiczenie — analiza odpowiedzi API

AI otrzymuje rzeczywisty request i response, a następnie:

- sprawdza zgodność statusu HTTP z dokumentacją;
- porównuje strukturę odpowiedzi z OpenAPI;
- sprawdza typy i wymagane pola;
- analizuje `correlationId`;
- wskazuje podejrzane albo niespójne dane;
- oddziela potwierdzone problemy od hipotez;
- proponuje kolejne testy.

## 8.5. Ćwiczenie rozszerzające — bezpieczny skrypt API w Pythonie

### Cel

Pokazanie, że tester może za pomocą AI przygotować prosty skrypt do powtarzalnych testów API i podstawowego pomiaru czasu odpowiedzi bez samodzielnego pisania programu od zera.

Nie używamy k6. Skrypt Python jest ćwiczeniem z testowania API i nie jest liczony jako jedno z dwóch większych narzędzi tworzonych w bloku 7.

### Zakres skryptu

Skrypt:

- loguje się jednokrotnie do Kliniki Debug;
- pobiera token Bearer;
- wykonuje serię żądań do wybranego endpointu odczytowego;
- mierzy czas każdego requestu;
- obsługuje timeout i błędy sieciowe;
- zlicza statusy HTTP;
- oddziela udane odpowiedzi od błędów;
- oblicza `min`, `avg`, `p50`, `p95` i `max`;
- sprawdza wymaganie `p95 < 800 ms` dla odczytów;
- zapisuje szczegóły do CSV albo JSON;
- wyświetla czytelne podsumowanie po polsku.

Do prostej współbieżności może wykorzystać:

```python
concurrent.futures.ThreadPoolExecutor
```

### Konfiguracja

Przykładowe uruchomienie:

```bash
python api_performance_test.py \
  --base-url https://klinikadebug.rwasik.pl \
  --endpoint /api/v1/orders \
  --requests 20 \
  --workers 2
```

Dane logowania są przekazywane przez zmienne środowiskowe:

```text
KLINIKA_LOGIN
KLINIKA_PASSWORD
```

Nie wolno wpisywać hasła ani tokenu bezpośrednio do kodu lub pliku wynikowego.

### Bezpieczne wartości domyślne

```text
requests: 20
workers: 2
timeout: 5 sekund
```

Twarde ograniczenia skryptu:

```text
maksymalnie 200 requestów
maksymalnie 10 workerów
```

Silniejszy pomiar powinien zostać wykonany jako jeden kontrolowany przebieg. Równoczesne uruchomienie wielu testów obciążeniowych przez całą grupę mogłoby zakłócić wspólne środowisko.

### Elementy podlegające przeglądowi

- Czy skrypt nie loguje się przed każdym requestem?
- Czy czas logowania nie jest doliczany do pomiaru endpointu?
- Czy liczba żądań jest ograniczona?
- Czy istnieje timeout?
- Czy odpowiedzi błędne nie są traktowane jako sukces?
- Czy percentyle są obliczane poprawnie?
- Czy token i hasło nie trafiają do logów?
- Czy skrypt korzysta wyłącznie z bezpiecznych endpointów odczytowych?
- Czy raport pozwala odtworzyć warunki pomiaru?

### Przebieg pracy z AI

1. Opisanie celu i wymagań skryptu.
2. Wygenerowanie pierwszej wersji.
3. Wyjaśnienie kodu przez AI prostym językiem.
4. Krytyczna analiza wygenerowanego rozwiązania.
5. Uruchomienie małego testu.
6. Przekazanie wyniku do AI.
7. Interpretacja rezultatu.
8. Poprawienie wykrytych problemów bez ręcznego przepisywania całego programu.

---

# 9. Blok 7 — skrypty i narzędzia z AI bez programowania

## 9.1. Wspólny sposób tworzenia narzędzi

Dla obu narzędzi obowiązuje ten sam proces:

1. opis problemu testera;
2. określenie małego MVP;
3. przygotowanie wymagań i kryteriów akceptacji;
4. wygenerowanie struktury rozwiązania;
5. wygenerowanie plików przez AI;
6. uruchomienie narzędzia;
7. przetestowanie na Klinice Debug;
8. przekazanie błędu lub brakującego wymagania do AI;
9. wprowadzenie poprawki;
10. opcjonalne code review przy użyciu drugiego modelu.

Celem nie jest nauka składni programowania, lecz pokazanie procesu: problem → wymagania → kod wygenerowany przez AI → uruchomienie → test → poprawka.

## 9.2. Narzędzie 1 — rozszerzenie Chrome „Klinika Data Helper”

### Problem

Ręczne wpisywanie kompletnych i spójnych danych pacjenta spowalnia testowanie formularza.

### MVP

Rozszerzenie działa wyłącznie na `klinikadebug.rwasik.pl` i umożliwia:

- wygenerowanie syntetycznego dorosłego pacjenta;
- wygenerowanie pacjenta niepełnoletniego wraz z opiekunem;
- wygenerowanie pacjenta bez PESEL-u;
- wypełnienie formularza dodawania pacjenta;
- skopiowanie danych jako JSON;
- wygenerowanie wybranego, świadomie niepoprawnego wariantu danych.

### Kryteria jakości

- PESEL jest prawidłowy i spójny z datą urodzenia oraz płcią;
- wygenerowane dane odpowiadają polom formularza;
- dane nie są wysyłane do zewnętrznego API;
- rozszerzenie nie odczytuje tokenów sesji;
- uprawnienia Manifest V3 są ograniczone do minimum;
- rozszerzenie nie działa na innych domenach;
- interfejs narzędzia jest po polsku;
- dane są jednoznacznie oznaczone jako syntetyczne.

### Przykładowe testy narzędzia

- dorosły pacjent przechodzi walidację formularza;
- osoba niepełnoletnia otrzymuje kompletne dane opiekuna;
- dokument zagraniczny nie zawiera PESEL-u;
- dwukrotne generowanie daje różne identyfikatory;
- kopiowany JSON odpowiada danym wpisanym do formularza;
- wariant niepoprawny narusza wyłącznie wskazaną regułę;
- narzędzie nie uruchamia się poza domeną Kliniki Debug.

## 9.3. Narzędzie 2 — „Correlation Inspector”

### Problem

Analiza wielu wpisów logów i łączenie ich z requestem oraz odpowiedzią API jest czasochłonne.

### Forma

Prosta aplikacja HTML, CSS i JavaScript uruchamiana lokalnie w przeglądarce. Dane nie są wysyłane na serwer.

### MVP

Narzędzie umożliwia:

- wklejenie tekstu logów;
- wczytanie syntetycznego pliku logów;
- filtrowanie po `correlationId`;
- grupowanie zdarzeń;
- ułożenie chronologicznej osi;
- wyróżnienie błędów, retry i zmian statusu;
- wykrycie potencjalnie niezamaskowanych danych pacjenta;
- wygenerowanie szkicu raportu błędu w Markdown;
- pobranie albo skopiowanie rezultatu.

### Kryteria jakości

- narzędzie działa bez backendu;
- logi pozostają w przeglądarce użytkownika;
- błędny wiersz nie powoduje utraty pozostałych danych;
- brak `correlationId` jest wyraźnie oznaczony;
- sortowanie zdarzeń wykorzystuje czas z logu;
- fakty są oddzielone od automatycznie wygenerowanego opisu;
- wykrycie danych wrażliwych jest oznaczone jako ostrzeżenie wymagające weryfikacji;
- interfejs i raport są po polsku.

### Przykładowe testy narzędzia

- jeden `correlationId` i kilka zdarzeń;
- kilka niezależnych operacji w jednym pliku;
- zdarzenia zapisane w niechronologicznej kolejności;
- niepoprawna linia JSON;
- brak pola czasu;
- brak `correlationId`;
- pełny oraz prawidłowo zamaskowany PESEL;
- retry zakończone sukcesem;
- retry zakończone `TECHNICAL_ERROR`;
- poprawne wygenerowanie Markdown bez ujawnienia sekretów.

## 9.4. Wykorzystanie różnych modeli

ChatGPT, Gemini i Claude mogą zostać użyte w różnych rolach:

- pierwszy model pomaga doprecyzować wymagania;
- drugi generuje implementację;
- kolejny wykonuje review kodu albo kryteriów akceptacji;
- dowolny model pomaga zinterpretować błąd uruchomieniowy.

Nie zakładamy stałego przypisania modelu do zadania. Porównujemy jakość procesu, zgodność z kontekstem i łatwość weryfikacji, a nie samą długość odpowiedzi.

---

# 10. Zasady weryfikacji odpowiedzi AI

Każdy artefakt przygotowany przez AI powinien przejść co najmniej jedną z poniższych form weryfikacji:

- porównanie z dokumentacją produktową;
- porównanie z OpenAPI;
- wykonanie w aplikacji;
- wykonanie requestu;
- sprawdzenie danych niezależnym algorytmem;
- analiza przez drugą rozmowę lub drugi model;
- przegląd kryteriów akceptacji;
- sprawdzenie, czy model nie pomieszał faktów z hipotezami.

Pytania kontrolne:

1. Z jakiego źródła pochodzi oczekiwane zachowanie?
2. Które elementy odpowiedzi są faktami?
3. Jakie założenia przyjął model?
4. Czego brakuje w dostarczonym kontekście?
5. Czy rezultat można wykonać albo jednoznacznie sprawdzić?
6. Czy dane są syntetyczne?
7. Czy artefakt nie zawiera sekretów lub danych wrażliwych?
8. Czy odpowiedź AI faktycznie oszczędza czas po uwzględnieniu weryfikacji?

# 11. Rezultaty praktycznej części warsztatu

W zależności od wybranego zakresu uczestnik kończy warsztat z częścią lub całością następujących artefaktów:

- porównaniem odpowiedzi bez kontekstu i z kontekstem;
- listą pytań i luk w wymaganiach;
- zestawem przypadków testowych procesu Kliniki Debug;
- analizą ryzyka i minimalnym zakresem regresji;
- kartą sesji eksploracyjnej;
- raportem błędu;
- macierzą syntetycznych danych pacjentów;
- plikiem CSV do testów importu;
- analizą logów po `correlationId`;
- zestawem requestów API;
- analizą odpowiedzi API;
- bezpiecznym skryptem testowym w Pythonie;
- rozszerzeniem Chrome „Klinika Data Helper”;
- aplikacją „Correlation Inspector”.

# 12. Podsumowanie

Końcowe podsumowanie wraca do trzech zasad przewijających się przez wszystkie ćwiczenia:

1. **Kontekst zmienia jakość odpowiedzi** — ogólna wiedza modelu nie zastępuje wiedzy projektowej.
2. **AI przygotowuje propozycję, nie dowód** — przypadek, dane, raport i kod trzeba zweryfikować.
3. **Najlepszy rezultat powstaje iteracyjnie** — wymagania, odpowiedź, test, informacja zwrotna i poprawka tworzą jeden proces pracy.
