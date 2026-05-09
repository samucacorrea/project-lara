CREATE TABLE IF NOT EXISTS `external_sync_jobs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `connection_id` BIGINT UNSIGNED NOT NULL,
  `source_dataset_id` BIGINT UNSIGNED NULL,
  `job_type` ENUM('initial_sync', 'incremental_sync', 'refresh', 'backfill') NOT NULL,
  `status` ENUM('pending', 'running', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  `date_from` DATE NULL,
  `date_to` DATE NULL,
  `payload_json` JSON NULL,
  `error_message` TEXT NULL,
  `started_at` DATETIME NULL,
  `finished_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_external_sync_jobs_connection` (`connection_id`),
  KEY `idx_external_sync_jobs_dataset` (`source_dataset_id`),
  KEY `idx_external_sync_jobs_status` (`status`),
  CONSTRAINT `fk_external_sync_jobs_connection`
    FOREIGN KEY (`connection_id`) REFERENCES `external_connections` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_external_sync_jobs_dataset`
    FOREIGN KEY (`source_dataset_id`) REFERENCES `source_datasets` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
