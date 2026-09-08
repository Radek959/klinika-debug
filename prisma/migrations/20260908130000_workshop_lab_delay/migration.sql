-- Dodaje konfigurowalny czas generowania wyników laboratorium (`labDelayMs`)
-- do globalnej konfiguracji panelu prowadzącego (`workshop_config`) oraz do
-- trwałego zadania automatycznego ponowienia wysyłki
-- (`lab_send_retry_jobs`), tak aby retry zachowywał delay właściwy dla
-- pierwotnego chaina zamiast czytać bieżącą konfigurację dopiero w chwili
-- wykonania.
--
-- Migracja jest wyłącznie addytywna: dodaje dwie kolumny z wartością
-- domyślną 300000 (dotychczasowe stałe zachowanie CLEAN/SUCCESS), nie
-- zmienia i nie usuwa żadnej istniejącej tabeli, kolumny ani danych.

-- AlterTable
ALTER TABLE `workshop_config` ADD COLUMN `labDelayMs` INTEGER NOT NULL DEFAULT 300000;

-- AlterTable
ALTER TABLE `lab_send_retry_jobs` ADD COLUMN `labDelayMs` INTEGER NOT NULL DEFAULT 300000;
