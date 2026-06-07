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

INSERT INTO `permissions` (`id`, `name`, `identifier`, `description`) VALUES
  (1,'Manage SASP settings','sasp_manage_settings','Manage settings and preferences for the SASP.'),
  (2,'View all organizations','sasp_view_all_organizations','View all organizations registered in the system.'),
  (3,'View all donee accounts','sasp_view_all_donee_accounts','View all accounts related to donee organizations.'),
  (4,'View all SASP users','sasp_view_all_users','View all users within the SASP.'),
  (5,'View all requests','sasp_view_all_requests','View all requests and properties within those requests.'),
  (6,'View requests by property ICN','view_requests_by_icn','View all requests that have the same property ICN.'),
  (7,'Add new SASP users','add_sasp_users','Add new users to the SASP.'),
  (8,'Manage SASP users','sasp_manage_sasp_users','Manage SASP users, roles, and permissions.'),
  (9,'Manage requests','sasp_manage_all_requests','Manage existing requests within the SASP.'),
  (10,'Generate LOAR documents','sasp_generate_request_loar','Generate signed LOAR documents for requests.'),
  (11,'Generate invoices','sasp_generate_request_invoice','Generate invoices for requests within the SASP.'),
  (12,'Attach files to requests','attach_files_to_requests','Attach files and documents to requests.'),
  (13,'Review and approve organizations','sasp_approve_organizations','Review and approve new organizations registered.'),
  (14,'View organization info','view_organization_info','View organization-specific information.'),
  (15,'Manage organization info','manage_organization_info','Manage organization-specific information.'),
  (16,'Add new organization users','add_organization_users','Add new users within the organization.'),
  (17,'Manage organization users','manage_organization_users','Manage users, roles, and permissions within the organization.'),
  (18,'Create new requests','create_requests','Create new requests within the organization.'),
  (20,'View organization requests','view_organization_requests','View all requests within the organization.'),
  (21,'Manage organization donee accounts','manage_organization_donee_account','Manage organization donee accounts.')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `identifier` = VALUES(`identifier`),
  `description` = VALUES(`description`);

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

DELETE FROM `role_permissions`;

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
  (4,14),(6,14),(4,15),(4,16),(4,17),(4,18),(4,20),(6,20),(4,21);

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
