CREATE TABLE IF NOT EXISTS `external_sync_job_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sync_job_id` BIGINT UNSIGNED NOT NULL,
  `level` ENUM('info', 'warning', 'error') NOT NULL DEFAULT 'info',
  `message` TEXT NOT NULL,
  `context_json` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_external_sync_job_logs_job` (`sync_job_id`),
  CONSTRAINT `fk_external_sync_job_logs_job`
    FOREIGN KEY (`sync_job_id`) REFERENCES `external_sync_jobs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
