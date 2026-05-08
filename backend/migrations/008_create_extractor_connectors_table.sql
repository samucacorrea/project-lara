CREATE TABLE IF NOT EXISTS `extractor_connectors` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `provider` ENUM('google_ads','google_analytics','microsoft_clarity','meta_ads','meta_organic','tiktok_ads','custom') NOT NULL DEFAULT 'custom',
  `auth_type` ENUM('oauth','api_key','service_account','access_token','none') NOT NULL DEFAULT 'api_key',
  `config` JSON NOT NULL,
  `target_table` VARCHAR(255) NOT NULL,
  `status` ENUM('draft','active','inactive') NOT NULL DEFAULT 'draft',
  `last_synced_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_connector_table` (`target_table`),
  KEY `idx_provider_status` (`provider`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
