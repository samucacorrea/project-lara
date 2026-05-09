CREATE TABLE IF NOT EXISTS `external_connections` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `provider` ENUM(
    'google_ads',
    'meta_ads',
    'tiktok_ads',
    'google_analytics',
    'rd_station',
    'hubspot',
    'magneticgo'
  ) NOT NULL,
  `status` ENUM('draft', 'connected', 'expired', 'error', 'syncing', 'inactive') NOT NULL DEFAULT 'draft',
  `auth_type` ENUM('oauth2', 'api_key', 'token', 'service_account') NOT NULL,
  `config_json` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_external_connections_user` (`user_id`),
  KEY `idx_external_connections_provider_status` (`provider`, `status`),
  CONSTRAINT `fk_external_connections_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
