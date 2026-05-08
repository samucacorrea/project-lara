ALTER TABLE `reports`
  ADD COLUMN `layout_type` ENUM('desktop', 'mobile') NOT NULL DEFAULT 'desktop' AFTER `is_public`;
