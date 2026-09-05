ALTER TABLE `patients`
  ADD COLUMN `birthDate` DATE NULL,
  ADD COLUMN `gender` ENUM('FEMALE', 'MALE') NULL,
  ADD COLUMN `citizenship` VARCHAR(191) NULL,
  ADD COLUMN `phone` VARCHAR(191) NULL,
  ADD COLUMN `email` VARCHAR(191) NULL,
  ADD COLUMN `addressStreet` VARCHAR(191) NULL,
  ADD COLUMN `addressBuildingNumber` VARCHAR(191) NULL,
  ADD COLUMN `addressApartmentNumber` VARCHAR(191) NULL,
  ADD COLUMN `addressPostalCode` VARCHAR(191) NULL,
  ADD COLUMN `addressCity` VARCHAR(191) NULL,
  ADD COLUMN `addressCountry` VARCHAR(191) NULL;

UPDATE `patients`
SET
  `birthDate` = DATE('1900-01-01'),
  `gender` = CASE
    WHEN `pesel` REGEXP '^[0-9]{11}$'
      AND MOD(CAST(SUBSTRING(`pesel`, 10, 1) AS UNSIGNED), 2) = 1
    THEN 'MALE'
    ELSE 'FEMALE'
  END
WHERE `birthDate` IS NULL OR `gender` IS NULL;

ALTER TABLE `patients`
  MODIFY COLUMN `birthDate` DATE NOT NULL,
  MODIFY COLUMN `gender` ENUM('FEMALE', 'MALE') NOT NULL;

CREATE INDEX `patients_workspace_name_idx`
  ON `patients`(`workspaceId`, `lastName`, `firstName`);

CREATE INDEX `patients_workspace_birth_date_idx`
  ON `patients`(`workspaceId`, `birthDate`);

CREATE INDEX `patients_workspace_created_at_idx`
  ON `patients`(`workspaceId`, `createdAt`);

CREATE INDEX `patients_workspace_active_idx`
  ON `patients`(`workspaceId`, `active`);

CREATE TABLE `guardians` (
  `id` VARCHAR(191) NOT NULL,
  `workspaceId` VARCHAR(191) NOT NULL,
  `patientId` VARCHAR(191) NOT NULL,
  `firstName` VARCHAR(191) NOT NULL,
  `lastName` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `guardians_patientId_key`(`patientId`),
  INDEX `guardians_workspace_idx`(`workspaceId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `guardians`
  ADD CONSTRAINT `guardians_workspaceId_fkey`
  FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `guardians`
  ADD CONSTRAINT `guardians_patientId_fkey`
  FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
