SET FOREIGN_KEY_CHECKS = 0;

INSERT INTO `demil_conditions` (`id`, `code`, `name`) VALUES
  (0,'A','A - Non-MLI/Non-CCLI'),
  (1,'B','B - MLI (Non-SME)'),
  (2,'C','C - MLI (SME)'),
  (3,'D','D - MLI (SME)'),
  (4,'E','E - MLI (Non-SME)'),
  (5,'F','F - MLI (SME)'),
  (6,'G','G - MLI (SME)'),
  (7,'P','P - MLI (SME)'),
  (8,'Q','Q - CCLI')
ON DUPLICATE KEY UPDATE
  `code` = VALUES(`code`),
  `name` = VALUES(`name`);

INSERT INTO `disposal_conditions` (`id`, `code`, `name`) VALUES
  (1,'N','N - New/Unused'),
  (2,'U','U - Usable'),
  (3,'R','R - Repairable'),
  (4,'X','X - Salvage'),
  (5,'S','S - Scrap')
ON DUPLICATE KEY UPDATE
  `code` = VALUES(`code`),
  `name` = VALUES(`name`);

DELETE FROM `role_permissions`;

INSERT INTO `permissions` (`id`, `name`, `identifier`, `description`) VALUES
  (1,'Manage SASP Settings','sasp_manage_settings','description'),
  (2,'Manage SASP Users','sasp_manage_sasp_users','description'),
  (3,'Approve Organizations','sasp_approve_organizations','description'),
  (4,'View All Organizations','sasp_view_all_organizations','only local sasp'),
  (5,'View All Donee Accounts','sasp_view_all_donee_accounts','only local sasp'),
  (6,'View All Users','sasp_view_all_users','only local sasp'),
  (7,'View All Requests','sasp_view_all_requests','only local sasp'),
  (8,'Manage All Requests','sasp_manage_all_requests','description'),
  (9,'Generate Request LOAR','sasp_generate_request_loar','description'),
  (10,'Generate Request Invoice','sasp_generate_request_invoice','description'),
  (11,'View Organization Requests','view_organization_requests','description'),
  (12,'View Organization Info','view_organization_info','description'),
  (13,'Manage Organization Info','manage_organization_info','description'),
  (14,'Manage Organization Users','manage_organization_users','description'),
  (15,'Manage Donee Account','manage_donee_account','description'),
  (17,'Manage Requests','manage_requests','description'),
  (18,'Attach Files to Requests','attach_files_to_requests','description'),
  (19,'Manage Organization Donee Accounts','manage_organization_donee_account','description')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `identifier` = VALUES(`identifier`),
  `description` = VALUES(`description`);

DELETE FROM `permissions` WHERE `id` NOT IN (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,17,18,19);

INSERT INTO `property_types` (`id`, `code`, `name`) VALUES
  (1,'NR','A - No Special Requirements'),
  (2,'PR','G - Surplus Proceeds Retention'),
  (3,'ES','B - Exchange Sale'),
  (4,'WC','C - Working Capital'),
  (5,'TS','C- Legislative Auth'),
  (6,'NA','C - Non-appropriated'),
  (7,'WM','C - Govt Corporation'),
  (8,'E','E- Seized and Forfeited'),
  (9,'F','F- Abandoned/Unclaimed')
ON DUPLICATE KEY UPDATE
  `code` = VALUES(`code`),
  `name` = VALUES(`name`);

INSERT INTO `request_attachment_types` (`id`, `name`) VALUES
  (1,'SF-123'),
  (2,'LOAR'),
  (3,'Invoice'),
  (4,'Other')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`);

INSERT INTO `request_statuses` (`id`, `name`, `color`) VALUES
  (1,'New Request','#079dfb'),
  (2,'Sent to GSA','#FDC707'),
  (3,'Pending Action','#FBA507'),
  (4,'Canceled','#6C757D'),
  (5,'Allocated','#28A745'),
  (6,'Rejected','#DC3545'),
  (7,'Escalated','#EE6C45'),
  (8,'Completed','#32CD32')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `color` = VALUES(`color`);

INSERT INTO `roles` (`role_id`, `role_name`, `createdAt`, `updatedAt`) VALUES
  (1,'SASP Admin', NOW(), NOW()),
  (2,'SASP Property Manager', NOW(), NOW()),
  (3,'SASP View-Only Staff', NOW(), NOW()),
  (4,'Organization Admin', NOW(), NOW()),
  (5,'Organization Manager', NOW(), NOW()),
  (6,'Organization Member', NOW(), NOW()),
  (7,'Donee Authorized Representative', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `role_name` = VALUES(`role_name`),
  `updatedAt` = NOW();

INSERT INTO `scopes` (`scope_id`, `type`) VALUES
  (1, 'sasp'),
  (2, 'organization'),
  (3, 'donee')
ON DUPLICATE KEY UPDATE
  `type` = VALUES(`type`);

INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
  (1,1),(1,2),(1,3),
  (1,4),(2,4),(3,4),
  (1,5),(2,5),(3,5),
  (1,6),(2,6),(3,6),
  (1,7),(2,7),(3,7),
  (1,8),(2,8),
  (1,9),(2,9),
  (1,10),(2,10),
  (1,11),(2,11),(3,11),(4,11),
  (1,12),(2,12),
  (1,13),
  (4,12),(6,12),(4,13),(4,14),(4,15),(4,17),(5,17),(4,18),(4,19);

INSERT INTO `supply_conditions` (`id`, `code`, `name`) VALUES
  (1,'A','A - Serviceable - Issuable without Qualification'),
  (2,'B','B - Serviceable - Issuable with Qualification'),
  (3,'C','C - Serviceable - Priority Issue'),
  (4,'D','D - Serviceable - Test/Modification'),
  (5,'E','E - Unserviceable - Limited Restoration'),
  (6,'F','F - Unserviceable - Repairable'),
  (7,'G','G - Unserviceable - Incomplete'),
  (8,'H','H - Unserviceable - Condemned'),
  (9,'S','S - Unserviceable - Scrap')
ON DUPLICATE KEY UPDATE
  `code` = VALUES(`code`),
  `name` = VALUES(`name`);

SET FOREIGN_KEY_CHECKS = 1;
