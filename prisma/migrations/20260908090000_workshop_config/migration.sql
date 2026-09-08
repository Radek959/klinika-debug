-- Globalna, jednowierszowa konfiguracja panelu prowadzącego (`/admin`):
-- bieżący scenariusz symulatora laboratorium i bieżący kontrolowany błąd.
--
-- Migracja jest wyłącznie addytywna: tworzy nową tabelę, nie zmienia i nie
-- usuwa żadnej istniejącej tabeli, kolumny ani danych. Tabela nie ma kluczy
-- obcych do żadnego workspace'u — konfiguracja jest celowo globalna, a nie
-- per-workspace.

-- CreateTable
CREATE TABLE `workshop_config` (
  `id` VARCHAR(191) NOT NULL,
  `labScenario` VARCHAR(191) NOT NULL,
  `controlledBug` VARCHAR(191) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
