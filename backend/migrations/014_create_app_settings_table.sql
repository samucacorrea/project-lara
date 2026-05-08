CREATE TABLE IF NOT EXISTS `app_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tool_name` VARCHAR(255) NOT NULL DEFAULT 'Project Lara',
  `logo_url` TEXT NULL,
  `favicon_url` TEXT NULL,
  `role_permissions` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `app_settings` (`id`, `tool_name`, `role_permissions`)
VALUES (
  1,
  'Project Lara',
  JSON_OBJECT(
    'admin', JSON_OBJECT('dashboard_list', true, 'dashboard_create', true, 'builder', true, 'constructor', true, 'manage_data_sources', true, 'manage_schema', true, 'admin_settings', true),
    'standard', JSON_OBJECT('dashboard_list', true, 'dashboard_create', true, 'builder', true, 'constructor', true, 'manage_data_sources', false, 'manage_schema', false, 'admin_settings', false),
    'viewer', JSON_OBJECT('dashboard_list', true, 'dashboard_create', false, 'builder', false, 'constructor', false, 'manage_data_sources', false, 'manage_schema', false, 'admin_settings', false)
  )
)
ON DUPLICATE KEY UPDATE `tool_name` = VALUES(`tool_name`);
