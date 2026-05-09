CREATE TABLE IF NOT EXISTS `dataset_definitions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `status` ENUM('draft', 'published', 'error', 'syncing', 'archived') NOT NULL DEFAULT 'draft',
  `warehouse_schema` VARCHAR(64) NOT NULL DEFAULT 'derived',
  `warehouse_table` VARCHAR(255) NULL,
  `primary_date_field` VARCHAR(128) NULL,
  `version` INT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_dataset_definitions_slug` (`slug`),
  KEY `idx_dataset_definitions_user` (`user_id`),
  CONSTRAINT `fk_dataset_definitions_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
