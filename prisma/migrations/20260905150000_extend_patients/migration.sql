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

CREATE TEMPORARY TABLE `_patient_pesel_backfill` AS
SELECT
  `id`,
  CASE
    WHEN `peselIsValid` = 1
      AND `birthDateIsValid` = 1
    THEN STR_TO_DATE(`candidateBirthDate`, '%Y-%m-%d')
    ELSE DATE('1900-01-01')
  END AS `birthDate`,
  CASE
    WHEN `peselIsValid` = 1
      AND `birthDateIsValid` = 1
    THEN `peselGender`
    ELSE 'FEMALE'
  END AS `gender`
FROM (
  SELECT
    `id`,
    CASE
      WHEN `yearBase` IS NOT NULL AND `decodedMonth` IS NOT NULL
      THEN CONCAT(
        CAST(`yearBase` + `yearPart` AS CHAR),
        '-',
        LPAD(CAST(`decodedMonth` AS CHAR), 2, '0'),
        '-',
        `dayPart`
      )
      ELSE NULL
    END AS `candidateBirthDate`,
    CASE
      WHEN `yearBase` IS NOT NULL
        AND `decodedMonth` IS NOT NULL
        AND `dayPartNumber` BETWEEN 1 AND DAY(LAST_DAY(STR_TO_DATE(CONCAT(
          CAST(`yearBase` + `yearPart` AS CHAR),
          '-',
          LPAD(CAST(`decodedMonth` AS CHAR), 2, '0'),
          '-01'
        ), '%Y-%m-%d')))
      THEN 1
      ELSE 0
    END AS `birthDateIsValid`,
    `peselGender`,
    `peselIsValid`
  FROM (
    SELECT
      `id`,
      CAST(SUBSTRING(`pesel`, 1, 2) AS UNSIGNED) AS `yearPart`,
      SUBSTRING(`pesel`, 5, 2) AS `dayPart`,
      CAST(SUBSTRING(`pesel`, 5, 2) AS UNSIGNED) AS `dayPartNumber`,
      CASE
        WHEN CAST(SUBSTRING(`pesel`, 3, 2) AS UNSIGNED) BETWEEN 1 AND 12 THEN 1900
        WHEN CAST(SUBSTRING(`pesel`, 3, 2) AS UNSIGNED) BETWEEN 21 AND 32 THEN 2000
        WHEN CAST(SUBSTRING(`pesel`, 3, 2) AS UNSIGNED) BETWEEN 41 AND 52 THEN 2100
        WHEN CAST(SUBSTRING(`pesel`, 3, 2) AS UNSIGNED) BETWEEN 61 AND 72 THEN 2200
        WHEN CAST(SUBSTRING(`pesel`, 3, 2) AS UNSIGNED) BETWEEN 81 AND 92 THEN 1800
        ELSE NULL
      END AS `yearBase`,
      CASE
        WHEN CAST(SUBSTRING(`pesel`, 3, 2) AS UNSIGNED) BETWEEN 1 AND 12 THEN CAST(SUBSTRING(`pesel`, 3, 2) AS UNSIGNED)
        WHEN CAST(SUBSTRING(`pesel`, 3, 2) AS UNSIGNED) BETWEEN 21 AND 32 THEN CAST(SUBSTRING(`pesel`, 3, 2) AS UNSIGNED) - 20
        WHEN CAST(SUBSTRING(`pesel`, 3, 2) AS UNSIGNED) BETWEEN 41 AND 52 THEN CAST(SUBSTRING(`pesel`, 3, 2) AS UNSIGNED) - 40
        WHEN CAST(SUBSTRING(`pesel`, 3, 2) AS UNSIGNED) BETWEEN 61 AND 72 THEN CAST(SUBSTRING(`pesel`, 3, 2) AS UNSIGNED) - 60
        WHEN CAST(SUBSTRING(`pesel`, 3, 2) AS UNSIGNED) BETWEEN 81 AND 92 THEN CAST(SUBSTRING(`pesel`, 3, 2) AS UNSIGNED) - 80
        ELSE NULL
      END AS `decodedMonth`,
      CASE
        WHEN MOD(CAST(SUBSTRING(`pesel`, 10, 1) AS UNSIGNED), 2) = 1 THEN 'MALE'
        ELSE 'FEMALE'
      END AS `peselGender`,
      CASE
        WHEN `pesel` REGEXP '^[0-9]{11}$'
          AND MOD(
            10 - MOD(
              CAST(SUBSTRING(`pesel`, 1, 1) AS UNSIGNED) * 1 +
              CAST(SUBSTRING(`pesel`, 2, 1) AS UNSIGNED) * 3 +
              CAST(SUBSTRING(`pesel`, 3, 1) AS UNSIGNED) * 7 +
              CAST(SUBSTRING(`pesel`, 4, 1) AS UNSIGNED) * 9 +
              CAST(SUBSTRING(`pesel`, 5, 1) AS UNSIGNED) * 1 +
              CAST(SUBSTRING(`pesel`, 6, 1) AS UNSIGNED) * 3 +
              CAST(SUBSTRING(`pesel`, 7, 1) AS UNSIGNED) * 7 +
              CAST(SUBSTRING(`pesel`, 8, 1) AS UNSIGNED) * 9 +
              CAST(SUBSTRING(`pesel`, 9, 1) AS UNSIGNED) * 1 +
              CAST(SUBSTRING(`pesel`, 10, 1) AS UNSIGNED) * 3,
              10
            ),
            10
          ) = CAST(SUBSTRING(`pesel`, 11, 1) AS UNSIGNED)
        THEN 1
        ELSE 0
      END AS `peselIsValid`
    FROM `patients`
  ) `decodedPesel`
) `candidatePeselData`;

UPDATE `patients`
INNER JOIN `_patient_pesel_backfill`
  ON `_patient_pesel_backfill`.`id` = `patients`.`id`
SET
  `patients`.`birthDate` = `_patient_pesel_backfill`.`birthDate`,
  `patients`.`gender` = `_patient_pesel_backfill`.`gender`
WHERE `patients`.`birthDate` IS NULL OR `patients`.`gender` IS NULL;

DROP TEMPORARY TABLE `_patient_pesel_backfill`;

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

CREATE UNIQUE INDEX `patients_workspace_id_key`
  ON `patients`(`workspaceId`, `id`);

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
  UNIQUE INDEX `guardians_workspace_patient_key`(`workspaceId`, `patientId`),
  INDEX `guardians_workspace_idx`(`workspaceId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `guardians`
  ADD CONSTRAINT `guardians_workspaceId_fkey`
  FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `guardians`
  ADD CONSTRAINT `guardians_patientId_fkey`
  FOREIGN KEY (`workspaceId`, `patientId`) REFERENCES `patients`(`workspaceId`, `id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
