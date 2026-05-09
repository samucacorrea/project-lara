CREATE TABLE IF NOT EXISTS `dataset_selected_columns` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `dataset_definition_id` BIGINT UNSIGNED NOT NULL,
  `node_id` BIGINT UNSIGNED NOT NULL,
  `source_column` VARCHAR(128) NOT NULL,
  `output_column` VARCHAR(128) NOT NULL,
  `semantic_type` VARCHAR(64) NULL,
  `aggregation_type` ENUM('sum', 'avg', 'count', 'min', 'max', 'none') NULL DEFAULT 'none',
  `is_dimension` TINYINT(1) NOT NULL DEFAULT 0,
  `is_metric` TINYINT(1) NOT NULL DEFAULT 0,
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dataset_selected_columns_definition` (`dataset_definition_id`),
  KEY `idx_dataset_selected_columns_node` (`node_id`),
  CONSTRAINT `fk_dataset_selected_columns_definition`
    FOREIGN KEY (`dataset_definition_id`) REFERENCES `dataset_definitions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dataset_selected_columns_node`
    FOREIGN KEY (`node_id`) REFERENCES `dataset_nodes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
