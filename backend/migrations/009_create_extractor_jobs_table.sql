CREATE TABLE IF NOT EXISTS `extractor_jobs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `connector_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  `target_table` VARCHAR(255) NOT NULL,
  `requested_by` BIGINT UNSIGNED DEFAULT NULL,
  `rows_processed` BIGINT UNSIGNED DEFAULT 0,
  `error_message` TEXT NULL,
  `started_at` DATETIME NULL,
  `finished_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_connector_status` (`connector_id`, `status`),
  CONSTRAINT `fk_job_connector` FOREIGN KEY (`connector_id`) REFERENCES `extractor_connectors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
