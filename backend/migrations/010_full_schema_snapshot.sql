-- Full schema snapshot
-- This migration recreates every table that Project Lara depends on so a brand-new
-- MySQL instance can be bootstrapped with a single migration.

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('admin','standard','viewer') NOT NULL DEFAULT 'viewer',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_sources` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `type` ENUM('mysql','google_sheets','bigquery') NOT NULL,
  `description` TEXT NULL,
  `config` JSON NOT NULL,
  `credential_reference` VARCHAR(255) DEFAULT NULL,
  `owner_id` BIGINT UNSIGNED DEFAULT NULL,
  `status` ENUM('draft','active','inactive') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_data_sources_owner` (`owner_id`),
  KEY `idx_data_sources_type_status` (`type`,`status`),
  CONSTRAINT `fk_data_sources_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `dashboards` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) DEFAULT NULL,
  `data_source_id` BIGINT UNSIGNED DEFAULT NULL,
  `global_filter` JSON DEFAULT NULL,
  `date_filter_visible` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dashboards_data_source` (`data_source_id`),
  CONSTRAINT `fk_dashboards_data_source`
    FOREIGN KEY (`data_source_id`) REFERENCES `data_sources` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reports` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `owner_id` BIGINT UNSIGNED NULL,
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(120) NOT NULL UNIQUE,
  `data_source_id` BIGINT UNSIGNED DEFAULT NULL,
  `global_filter` JSON DEFAULT NULL,
  `date_filter_visible` TINYINT(1) NOT NULL DEFAULT 1,
  `is_public` TINYINT(1) NOT NULL DEFAULT 0,
  `layout_type` ENUM('desktop','mobile') NOT NULL DEFAULT 'desktop',
  `widgets` JSON NOT NULL,
  `canvas_settings` JSON DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reports_owner` (`owner_id`),
  KEY `idx_reports_data_source` (`data_source_id`),
  CONSTRAINT `fk_reports_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_data_source`
    FOREIGN KEY (`data_source_id`) REFERENCES `data_sources` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `report_collaborators` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `report_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `permission` ENUM('view','edit') NOT NULL DEFAULT 'edit',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_report_user` (`report_id`,`user_id`),
  CONSTRAINT `fk_collaborators_report`
    FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_collaborators_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `calculated_metrics` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `metric_key` VARCHAR(120) NOT NULL UNIQUE,
  `formula` TEXT NOT NULL,
  `output_format` ENUM('number','decimal','currency','percent') NOT NULL DEFAULT 'number',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  KEY `idx_provider_status` (`provider`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `extractor_jobs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `connector_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  `target_table` VARCHAR(255) NOT NULL,
  `requested_by` BIGINT UNSIGNED DEFAULT NULL,
  `rows_processed` BIGINT UNSIGNED DEFAULT 0,
  `error_message` TEXT NULL,
  `started_at` DATETIME NULL,
  `finished_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_connector_status` (`connector_id`,`status`),
  CONSTRAINT `fk_jobs_connector`
    FOREIGN KEY (`connector_id`) REFERENCES `extractor_connectors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `users` (`name`,`email`,`password_hash`,`role`)
VALUES ('Samuel Corrêa','samuel.correa@lvl.com.br','$2y$12$xBCyJ3RoLpzlqEzbMJuS7uG0XeLNc1eV6YD4XHGADjIceWAJ8b/ey','admin')
ON DUPLICATE KEY UPDATE `role` = VALUES(`role`);
