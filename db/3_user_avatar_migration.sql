-- Store CDN URL for user profile avatars
ALTER TABLE `users`
ADD COLUMN `avatar_url` VARCHAR(512) NULL AFTER `name`;
