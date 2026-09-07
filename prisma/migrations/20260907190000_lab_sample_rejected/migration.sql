-- Scenariusz symulatora SAMPLE_REJECTED: rozszerzenie enumów o wartości potrzebne
-- do zapisania odrzucenia próbki przez laboratorium.
--
-- Migracja jest addytywna: rozszerza listy dozwolonych wartości enumów, nie zmienia
-- żadnego istniejącego wiersza, nie usuwa kolumn ani danych i nie zmienia wartości
-- domyślnych. Istniejące zlecenia zachowują dotychczasowe statusy badań i historię.
--
-- Kolumny `samples`.`rejectionCode` i `samples`.`rejectionReason` istnieją już od
-- migracji `20260906100000_orders_foundation`, więc nie wymagają tu zmian.

-- AlterEnum: order_tests.status += REJECTED
ALTER TABLE `order_tests`
    MODIFY `status` ENUM('PENDING', 'COMPLETED', 'REJECTED') NOT NULL DEFAULT 'PENDING';

-- AlterEnum: order_history.eventType += LAB_SAMPLE_REJECTED
ALTER TABLE `order_history`
    MODIFY `eventType` ENUM('ORDER_CREATED', 'ORDER_UPDATED', 'SAMPLE_REGISTERED', 'ORDER_SENT_TO_LAB', 'LAB_ORDER_ACCEPTED', 'LAB_RESULT_RECEIVED', 'LAB_SAMPLE_REJECTED', 'TECHNICAL_ERROR') NOT NULL;
