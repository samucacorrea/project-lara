ALTER TABLE `users`
  ADD COLUMN `phone` VARCHAR(32) NULL AFTER `email`,
  ADD COLUMN `avatar_url` TEXT NULL AFTER `phone`;
