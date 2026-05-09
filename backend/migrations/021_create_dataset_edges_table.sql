CREATE TABLE IF NOT EXISTS `dataset_edges` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `dataset_definition_id` BIGINT UNSIGNED NOT NULL,
  `from_node_id` BIGINT UNSIGNED NOT NULL,
  `to_node_id` BIGINT UNSIGNED NOT NULL,
  `join_type` ENUM('left', 'inner') NOT NULL DEFAULT 'left',
  `from_field` VARCHAR(128) NOT NULL,
  `to_field` VARCHAR(128) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dataset_edges_definition` (`dataset_definition_id`),
  KEY `idx_dataset_edges_from_node` (`from_node_id`),
  KEY `idx_dataset_edges_to_node` (`to_node_id`),
  CONSTRAINT `fk_dataset_edges_definition`
    FOREIGN KEY (`dataset_definition_id`) REFERENCES `dataset_definitions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dataset_edges_from_node`
    FOREIGN KEY (`from_node_id`) REFERENCES `dataset_nodes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dataset_edges_to_node`
    FOREIGN KEY (`to_node_id`) REFERENCES `dataset_nodes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
