-- Scenariusz symulatora VALIDATION_ERROR: rozszerzenie enumu zdarzeń historii
-- o synchroniczne odrzucenie zlecenia przez laboratorium przy wysyłce.
--
-- Migracja jest addytywna: dopisuje jedną wartość do listy dozwolonych wartości
-- enumu `order_history`.`eventType`, nie zmienia żadnego istniejącego wiersza,
-- nie usuwa kolumn ani danych i nie zmienia wartości domyślnych. Wszystkie
-- wcześniejsze wartości enumu pozostają dozwolone, więc istniejąca historia
-- zleceń zachowuje swoje typy zdarzeń.
--
-- Szczegóły zdarzenia trafiają do istniejącej kolumny JSON `order_history`.`details`,
-- więc nie są tu potrzebne żadne nowe kolumny.

-- AlterEnum: order_history.eventType += LAB_ORDER_REJECTED
ALTER TABLE `order_history`
    MODIFY `eventType` ENUM('ORDER_CREATED', 'ORDER_UPDATED', 'SAMPLE_REGISTERED', 'ORDER_SENT_TO_LAB', 'LAB_ORDER_ACCEPTED', 'LAB_RESULT_RECEIVED', 'LAB_SAMPLE_REJECTED', 'LAB_ORDER_REJECTED', 'TECHNICAL_ERROR') NOT NULL;
