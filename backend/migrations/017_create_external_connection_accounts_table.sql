CREATE TABLE IF NOT EXISTS `external_connection_accounts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `connection_id` BIGINT UNSIGNED NOT NULL,
  `external_account_id` VARCHAR(255) NOT NULL,
  `external_account_name` VARCHAR(255) NOT NULL,
  `external_account_type` VARCHAR(64) NULL,
  `is_selected` TINYINT(1) NOT NULL DEFAULT 1,
  `metadata_json` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_external_connection_accounts_connection` (`connection_id`),
  KEY `idx_external_connection_accounts_external_id` (`external_account_id`),
  CONSTRAINT `fk_external_connection_accounts_connection`
    FOREIGN KEY (`connection_id`) REFERENCES `external_connections` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
