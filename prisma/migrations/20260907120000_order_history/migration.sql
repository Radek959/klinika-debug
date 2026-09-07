-- CreateTable
CREATE TABLE `order_history` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `sequence` INTEGER NOT NULL AUTO_INCREMENT,
    `eventType` ENUM('ORDER_CREATED', 'ORDER_UPDATED', 'SAMPLE_REGISTERED', 'ORDER_SENT_TO_LAB', 'LAB_ORDER_ACCEPTED', 'LAB_RESULT_RECEIVED', 'TECHNICAL_ERROR') NOT NULL,
    `actorType` ENUM('STAFF', 'SYSTEM', 'LAB') NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `correlationId` VARCHAR(191) NULL,
    `integrationEventId` VARCHAR(191) NULL,
    `previousStatus` ENUM('DRAFT', 'SAMPLE_COLLECTION_IN_PROGRESS', 'SAMPLE_COLLECTED', 'SENT_TO_LAB', 'PROCESSING', 'PARTIAL', 'COMPLETED', 'REJECTED', 'TECHNICAL_ERROR') NULL,
    `newStatus` ENUM('DRAFT', 'SAMPLE_COLLECTION_IN_PROGRESS', 'SAMPLE_COLLECTED', 'SENT_TO_LAB', 'PROCESSING', 'PARTIAL', 'COMPLETED', 'REJECTED', 'TECHNICAL_ERROR') NULL,
    `details` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `order_history_sequence_key`(`sequence`),
    INDEX `order_history_workspace_order_occurred_idx`(`workspaceId`, `orderId`, `occurredAt`, `sequence`),
    INDEX `order_history_workspace_actor_idx`(`workspaceId`, `actorUserId`),
    UNIQUE INDEX `order_history_workspace_integration_event_key`(`workspaceId`, `integrationEventId`, `eventType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `order_history` ADD CONSTRAINT `order_history_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_history` ADD CONSTRAINT `order_history_workspaceId_orderId_fkey` FOREIGN KEY (`workspaceId`, `orderId`) REFERENCES `orders`(`workspaceId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_history` ADD CONSTRAINT `order_history_workspaceId_actorUserId_fkey` FOREIGN KEY (`workspaceId`, `actorUserId`) REFERENCES `users`(`workspaceId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: odtworzenie jednego wpisu ORDER_CREATED dla zleceń utworzonych przed wprowadzeniem historii.
-- Backfill jest bezpieczny dla bazy produkcyjnej MySQL: nie usuwa ani nie modyfikuje istniejących zleceń,
-- próbek, wyników ani kont, a warunek NOT EXISTS chroni przed duplikatem, gdyby ten skrypt został
-- uruchomiony ponownie ręcznie. Nie odtwarzamy priorytetu ani listy badań z chwili utworzenia zlecenia,
-- ponieważ dla zleceń edytowanych po utworzeniu (funkcja edycji DRAFT) nie da się ich wiarygodnie
-- zrekonstruować z obecnego stanu — szczegóły wpisu zawierają wyłącznie znacznik `reconstructed: true`,
-- a UI prezentuje taki wpis jako odtworzony podczas migracji, bez fałszywych danych szczegółowych.
INSERT INTO `order_history` (
    `id`, `workspaceId`, `orderId`, `eventType`, `actorType`, `actorUserId`,
    `occurredAt`, `correlationId`, `integrationEventId`, `previousStatus`, `newStatus`, `details`, `createdAt`
)
SELECT
    CONCAT('legacy-order-created-', REPLACE(UUID(), '-', '')),
    `orders`.`workspaceId`,
    `orders`.`id`,
    'ORDER_CREATED',
    'STAFF',
    `orders`.`createdByUserId`,
    `orders`.`createdAt`,
    NULL,
    NULL,
    NULL,
    'DRAFT',
    JSON_OBJECT('reconstructed', TRUE),
    CURRENT_TIMESTAMP(3)
FROM `orders`
WHERE NOT EXISTS (
    SELECT 1 FROM `order_history`
    WHERE `order_history`.`workspaceId` = `orders`.`workspaceId`
      AND `order_history`.`orderId` = `orders`.`id`
      AND `order_history`.`eventType` = 'ORDER_CREATED'
);
