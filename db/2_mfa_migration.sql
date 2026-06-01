-- Add MFA-related columns to users table
ALTER TABLE `users`
ADD COLUMN `mfa_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN `mfa_secret` VARCHAR(255) NULL,
ADD COLUMN `mfa_backup_codes` JSON NULL,
ADD COLUMN `mfa_last_verified` DATETIME NULL;

-- Create index for MFA-related queries
CREATE INDEX `idx_users_mfa_enabled` ON `users` (`mfa_enabled`);

-- Create audit log table for MFA events
CREATE TABLE `mfa_audit_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(36) NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mfa_audit_logs_user_id` (`user_id`),
  KEY `idx_mfa_audit_logs_action` (`action`),
  KEY `idx_mfa_audit_logs_created_at` (`created_at`),
  CONSTRAINT `fk_mfa_audit_logs_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
); 