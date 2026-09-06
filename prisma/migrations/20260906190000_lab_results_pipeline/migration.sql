-- AlterTable
ALTER TABLE `order_tests` ADD COLUMN `status` ENUM('PENDING', 'COMPLETED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `orders` ADD UNIQUE INDEX `orders_external_order_id_key`(`externalOrderId`);

-- CreateTable
CREATE TABLE `results` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `medicalTestId` VARCHAR(191) NOT NULL,
    `parameterCode` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NULL,
    `referenceRange` VARCHAR(191) NULL,
    `flag` ENUM('LOW', 'NORMAL', 'HIGH', 'NOT_APPLICABLE') NOT NULL,
    `resultedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `results_order_test_parameter_key`(`orderId`, `medicalTestId`, `parameterCode`),
    INDEX `results_workspace_order_idx`(`workspaceId`, `orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lab_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `scenario` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `executeAt` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'DONE', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lockedAt` DATETIME(3) NULL,
    `lastError` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lab_jobs_status_execute_at_idx`(`status`, `executeAt`),
    INDEX `lab_jobs_workspace_order_idx`(`workspaceId`, `orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `processed_lab_events` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `processedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `processed_lab_events_workspace_event_key`(`workspaceId`, `eventId`),
    INDEX `processed_lab_events_workspace_order_idx`(`workspaceId`, `orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `results` ADD CONSTRAINT `results_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `results` ADD CONSTRAINT `results_workspaceId_orderId_fkey` FOREIGN KEY (`workspaceId`, `orderId`) REFERENCES `orders`(`workspaceId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_jobs` ADD CONSTRAINT `lab_jobs_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_jobs` ADD CONSTRAINT `lab_jobs_workspaceId_orderId_fkey` FOREIGN KEY (`workspaceId`, `orderId`) REFERENCES `orders`(`workspaceId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `processed_lab_events` ADD CONSTRAINT `processed_lab_events_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `processed_lab_events` ADD CONSTRAINT `processed_lab_events_workspaceId_orderId_fkey` FOREIGN KEY (`workspaceId`, `orderId`) REFERENCES `orders`(`workspaceId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
