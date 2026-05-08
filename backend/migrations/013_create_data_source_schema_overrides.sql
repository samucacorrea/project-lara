CREATE TABLE IF NOT EXISTS `data_source_schema_overrides` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `data_source_id` BIGINT UNSIGNED NOT NULL,
  `table_name` VARCHAR(255) NOT NULL,
  `column_name` VARCHAR(255) NOT NULL,
  `role` VARCHAR(32) DEFAULT NULL,
  `semantic_type` VARCHAR(32) DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_schema_override` (`data_source_id`, `table_name`, `column_name`),
  CONSTRAINT `fk_schema_override_source` FOREIGN KEY (`data_source_id`) REFERENCES `data_sources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
