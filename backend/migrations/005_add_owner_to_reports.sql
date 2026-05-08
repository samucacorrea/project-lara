ALTER TABLE `reports`
  ADD COLUMN `owner_id` BIGINT UNSIGNED NULL AFTER `id`;

UPDATE `reports` SET `owner_id` = NULL WHERE `owner_id` IS NULL;

ALTER TABLE `reports`
  ADD CONSTRAINT `fk_reports_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;
