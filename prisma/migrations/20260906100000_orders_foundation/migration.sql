-- Add workspace-scoped user key required by order and sample foreign keys.
ALTER TABLE `users` ADD CONSTRAINT `users_workspace_id_key` UNIQUE (`workspaceId`, `id`);

-- CreateTable
CREATE TABLE `medical_tests` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `materialType` ENUM('EDTA_BLOOD', 'SERUM', 'URINE') NOT NULL,
    `estimatedDurationMinutes` INTEGER NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `medical_tests_code_key`(`code`),
    INDEX `medical_tests_active_idx`(`active`),
    INDEX `medical_tests_material_type_idx`(`materialType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `test_parameters` (
    `id` VARCHAR(191) NOT NULL,
    `medicalTestId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `valueType` ENUM('NUMERIC', 'TEXT') NOT NULL,
    `unit` VARCHAR(191) NULL,
    `displayOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `test_parameters_test_code_key`(`medicalTestId`, `code`),
    INDEX `test_parameters_test_order_idx`(`medicalTestId`, `displayOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medical_test_required_fields` (
    `id` VARCHAR(191) NOT NULL,
    `medicalTestId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `valueType` ENUM('BOOLEAN', 'TEXT') NOT NULL,
    `required` BOOLEAN NOT NULL,
    `displayOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `medical_test_required_fields_test_code_key`(`medicalTestId`, `code`),
    INDEX `medical_test_required_fields_test_order_idx`(`medicalTestId`, `displayOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `priority` ENUM('ROUTINE', 'URGENT') NOT NULL,
    `status` ENUM('DRAFT', 'SAMPLE_COLLECTION_IN_PROGRESS', 'SAMPLE_COLLECTED', 'SENT_TO_LAB', 'PROCESSING', 'PARTIAL', 'COMPLETED', 'REJECTED', 'TECHNICAL_ERROR') NOT NULL DEFAULT 'DRAFT',
    `externalOrderId` VARCHAR(191) NULL,
    `correlationId` VARCHAR(191) NULL,
    `sentAt` DATETIME(3) NULL,
    `estimatedCompletionAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `orders_workspace_id_key`(`workspaceId`, `id`),
    INDEX `orders_workspace_patient_idx`(`workspaceId`, `patientId`),
    INDEX `orders_workspace_created_by_idx`(`workspaceId`, `createdByUserId`),
    INDEX `orders_workspace_status_idx`(`workspaceId`, `status`),
    INDEX `orders_workspace_created_at_idx`(`workspaceId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_tests` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `medicalTestId` VARCHAR(191) NOT NULL,
    `additionalData` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `order_tests_order_medical_test_key`(`orderId`, `medicalTestId`),
    INDEX `order_tests_workspace_order_idx`(`workspaceId`, `orderId`),
    INDEX `order_tests_medical_test_idx`(`medicalTestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `samples` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `materialType` ENUM('EDTA_BLOOD', 'SERUM', 'URINE') NOT NULL,
    `barcode` VARCHAR(191) NULL,
    `collectedAt` DATETIME(3) NULL,
    `collectedByUserId` VARCHAR(191) NULL,
    `status` ENUM('REQUIRED', 'COLLECTED', 'SENT', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'REQUIRED',
    `rejectionCode` VARCHAR(191) NULL,
    `rejectionReason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `samples_order_material_type_key`(`orderId`, `materialType`),
    UNIQUE INDEX `samples_workspace_barcode_key`(`workspaceId`, `barcode`),
    INDEX `samples_workspace_order_idx`(`workspaceId`, `orderId`),
    INDEX `samples_workspace_collected_by_idx`(`workspaceId`, `collectedByUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `test_parameters` ADD CONSTRAINT `test_parameters_medicalTestId_fkey` FOREIGN KEY (`medicalTestId`) REFERENCES `medical_tests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medical_test_required_fields` ADD CONSTRAINT `medical_test_required_fields_medicalTestId_fkey` FOREIGN KEY (`medicalTestId`) REFERENCES `medical_tests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_workspaceId_patientId_fkey` FOREIGN KEY (`workspaceId`, `patientId`) REFERENCES `patients`(`workspaceId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_workspaceId_createdByUserId_fkey` FOREIGN KEY (`workspaceId`, `createdByUserId`) REFERENCES `users`(`workspaceId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_tests` ADD CONSTRAINT `order_tests_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_tests` ADD CONSTRAINT `order_tests_workspaceId_orderId_fkey` FOREIGN KEY (`workspaceId`, `orderId`) REFERENCES `orders`(`workspaceId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_tests` ADD CONSTRAINT `order_tests_medicalTestId_fkey` FOREIGN KEY (`medicalTestId`) REFERENCES `medical_tests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `samples` ADD CONSTRAINT `samples_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `samples` ADD CONSTRAINT `samples_workspaceId_orderId_fkey` FOREIGN KEY (`workspaceId`, `orderId`) REFERENCES `orders`(`workspaceId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `samples` ADD CONSTRAINT `samples_workspaceId_collectedByUserId_fkey` FOREIGN KEY (`workspaceId`, `collectedByUserId`) REFERENCES `users`(`workspaceId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
