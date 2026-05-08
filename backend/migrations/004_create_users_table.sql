CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'standard', 'viewer') NOT NULL DEFAULT 'viewer',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `users` (`name`, `email`, `password_hash`, `role`)
VALUES ('Samuel Corrêa', 'samuel.correa@lvl.com.br', '$2y$12$xBCyJ3RoLpzlqEzbMJuS7uG0XeLNc1eV6YD4XHGADjIceWAJ8b/ey', 'admin')
ON DUPLICATE KEY UPDATE `role` = VALUES(`role`);
