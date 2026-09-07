-- Scenariusz symulatora TIMEOUT: brak odpowiedzi laboratorium przy wysyłce
-- zlecenia. Wykorzystuje ten sam mechanizm ponowień co SERVER_ERROR, ale
-- zapisuje osobny typ zdarzenia historii, żeby odróżnić timeout od
-- kontrolowanego błędu 5xx.
--
-- Migracja jest addytywna: rozszerza wyłącznie listę dozwolonych wartości
-- enumu `order_history`.`eventType` o `LAB_SEND_TIMEOUT_RECEIVED`. Nie zmienia
-- żadnego istniejącego wiersza, nie usuwa kolumn ani danych i zachowuje
-- wszystkie wcześniejsze wartości enumu.

-- AlterEnum: order_history.eventType += LAB_SEND_TIMEOUT_RECEIVED
ALTER TABLE `order_history`
    MODIFY `eventType` ENUM('ORDER_CREATED', 'ORDER_UPDATED', 'SAMPLE_REGISTERED', 'ORDER_SENT_TO_LAB', 'LAB_ORDER_ACCEPTED', 'LAB_RESULT_RECEIVED', 'LAB_SAMPLE_REJECTED', 'LAB_ORDER_REJECTED', 'LAB_RATE_LIMIT_RECEIVED', 'LAB_SEND_TIMEOUT_RECEIVED', 'LAB_SEND_RETRY', 'TECHNICAL_ERROR') NOT NULL;
