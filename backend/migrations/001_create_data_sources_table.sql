-- Project Lara - Data Sources table
-- Supports storing credential/configuration metadata for MySQL, Google Sheets, and BigQuery connectors.

CREATE TABLE IF NOT EXISTS `data_sources` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `type` ENUM('mysql', 'google_sheets', 'bigquery') NOT NULL,
  `description` TEXT NULL,

  -- Generic connection metadata is stored as JSON so each connector can keep its own structure.
  `config` JSON NOT NULL,

  -- Optional encrypted credential storage reference (e.g., KMS, Vault)
  `credential_reference` VARCHAR(255) DEFAULT NULL,

  -- Ownership metadata for multi-tenant support. Replace with actual FK once user/accounts table exists.
  `owner_id` BIGINT UNSIGNED DEFAULT NULL,

  `status` ENUM('draft', 'active', 'inactive') NOT NULL DEFAULT 'active',

  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_data_sources_owner` (`owner_id`),
  KEY `idx_data_sources_type_status` (`type`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Example config payloads (JSON) to help the future backend encoder:
-- MySQL:
-- {
--   "host": "127.0.0.1",
--   "port": 3306,
--   "database": "analytics",
--   "username": "dash_user",
--   "password": "secret",
--   "ssl": false
-- }
--
-- Google Sheets:
-- {
--   "spreadsheet_id": "1t7J...",
--   "worksheet": "Sheet1",
--   "service_account_email": "larabot@project-lara.iam.gserviceaccount.com",
--   "private_key_id": "123abc",
--   "scopes": ["https://www.googleapis.com/auth/spreadsheets.readonly"]
-- }
--
-- BigQuery:
-- {
--   "project_id": "laradb",
--   "dataset": "marketing",
--   "table": "daily_metrics",
--   "service_account": { ... Google credentials ... }
-- }
