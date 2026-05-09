CREATE TABLE IF NOT EXISTS `dataset_materializations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `dataset_definition_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('pending', 'running', 'success', 'error') NOT NULL DEFAULT 'pending',
  `warehouse_schema` VARCHAR(64) NOT NULL DEFAULT 'derived',
  `warehouse_table` VARCHAR(255) NOT NULL,
  `row_count` BIGINT NULL,
  `sql_hash` VARCHAR(128) NULL,
  `error_message` TEXT NULL,
  `started_at` DATETIME NULL,
  `finished_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dataset_materializations_definition` (`dataset_definition_id`),
  KEY `idx_dataset_materializations_status` (`status`),
  CONSTRAINT `fk_dataset_materializations_definition`
    FOREIGN KEY (`dataset_definition_id`) REFERENCES `dataset_definitions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
