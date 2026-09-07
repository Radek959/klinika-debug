-- Scenariusz symulatora RATE_LIMIT: trwała kolejka automatycznych ponowień wysyłki
-- zlecenia do laboratorium oraz nowe typy zdarzeń historii.
--
-- Migracja jest addytywna: tworzy jedną nową tabelę i rozszerza listę dozwolonych
-- wartości enumu `order_history`.`eventType`. Nie zmienia żadnego istniejącego
-- wiersza, nie usuwa kolumn ani danych, nie modyfikuje wartości domyślnych i
-- zachowuje wszystkie wcześniejsze wartości enumów. Istniejące zlecenia, historia,
-- zadania `lab_jobs` i klucze idempotencji pozostają nietknięte.
--
-- Tabela `lab_send_retry_jobs` jest celowo osobna od `lab_jobs`: `lab_jobs` trzyma
-- zaplanowane callbacki laboratorium z wynikami, a tutaj zapisujemy zadania
-- wychodzące — ponowienie wysyłki. Wiersz nie zawiera danych pacjenta, PESEL-u,
-- danych kontaktowych, kodów kreskowych, sekretów ani stack trace'ów: do ponowienia
-- wystarczają identyfikatory zlecenia i workspace'u.

-- CreateTable: lab_send_retry_jobs
CREATE TABLE `lab_send_retry_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `attemptNumber` INTEGER NOT NULL,
    `executeAt` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'DONE', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `correlationId` VARCHAR(191) NOT NULL,
    `scenario` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `requestHash` VARCHAR(191) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lockedAt` DATETIME(3) NULL,
    `lastError` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    -- Indeks schedulera: pobieranie wyłącznie zadań wymagalnych.
    INDEX `lab_send_retry_jobs_status_execute_at_idx`(`status`, `executeAt`),
    -- Izolacja workspace'u w zapytaniach po zleceniu.
    INDEX `lab_send_retry_jobs_workspace_order_idx`(`workspaceId`, `orderId`),
    -- MySQL nie obsługuje indeksów częściowych, więc ograniczenie „jedno aktywne
    -- ponowienie na zlecenie” realizujemy jako jeden wiersz na zlecenie. Zadanie
    -- zakończone zostaje jako DONE i blokuje utworzenie duplikatu.
    UNIQUE INDEX `lab_send_retry_jobs_workspace_order_key`(`workspaceId`, `orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lab_send_retry_jobs` ADD CONSTRAINT `lab_send_retry_jobs_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_send_retry_jobs` ADD CONSTRAINT `lab_send_retry_jobs_workspaceId_orderId_fkey` FOREIGN KEY (`workspaceId`, `orderId`) REFERENCES `orders`(`workspaceId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterEnum: order_history.eventType += LAB_RATE_LIMIT_RECEIVED, LAB_SEND_RETRY
ALTER TABLE `order_history`
    MODIFY `eventType` ENUM('ORDER_CREATED', 'ORDER_UPDATED', 'SAMPLE_REGISTERED', 'ORDER_SENT_TO_LAB', 'LAB_ORDER_ACCEPTED', 'LAB_RESULT_RECEIVED', 'LAB_SAMPLE_REJECTED', 'LAB_ORDER_REJECTED', 'LAB_RATE_LIMIT_RECEIVED', 'LAB_SEND_RETRY', 'TECHNICAL_ERROR') NOT NULL;
