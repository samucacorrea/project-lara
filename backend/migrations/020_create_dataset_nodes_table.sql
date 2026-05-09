CREATE TABLE IF NOT EXISTS `dataset_nodes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `dataset_definition_id` BIGINT UNSIGNED NOT NULL,
  `node_type` ENUM('source', 'derived') NOT NULL DEFAULT 'source',
  `source_dataset_id` BIGINT UNSIGNED NULL,
  `label` VARCHAR(255) NOT NULL,
  `pos_x` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `pos_y` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `config_json` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dataset_nodes_definition` (`dataset_definition_id`),
  KEY `idx_dataset_nodes_source_dataset` (`source_dataset_id`),
  CONSTRAINT `fk_dataset_nodes_definition`
    FOREIGN KEY (`dataset_definition_id`) REFERENCES `dataset_definitions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dataset_nodes_source_dataset`
    FOREIGN KEY (`source_dataset_id`) REFERENCES `source_datasets` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
