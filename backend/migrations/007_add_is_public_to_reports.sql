ALTER TABLE `reports`
  ADD COLUMN `is_public` TINYINT(1) NOT NULL DEFAULT 0 AFTER `date_filter_visible`;
