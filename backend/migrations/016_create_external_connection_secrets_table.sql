CREATE TABLE IF NOT EXISTS `external_connection_secrets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `connection_id` BIGINT UNSIGNED NOT NULL,
  `secret_key` VARCHAR(64) NOT NULL,
  `secret_value` TEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_external_connection_secret` (`connection_id`, `secret_key`),
  CONSTRAINT `fk_external_connection_secrets_connection`
    FOREIGN KEY (`connection_id`) REFERENCES `external_connections` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
