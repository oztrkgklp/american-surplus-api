-- MySQL dump 10.13  Distrib 8.0.38, for Win64 (x86_64)
--
-- Host: localhost    Database: american-surplus
-- ------------------------------------------------------
-- Server version	8.0.41

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Dumping data for table `demil_conditions`
--

LOCK TABLES `demil_conditions` WRITE;
/*!40000 ALTER TABLE `demil_conditions` DISABLE KEYS */;
INSERT INTO `demil_conditions` VALUES (0,'A','A - Non-MLI/Non-CCLI'),(1,'B','B - MLI (Non-SME)'),(2,'C','C - MLI (SME)'),(3,'D','D - MLI (SME)'),(4,'E','E - MLI (Non-SME)'),(5,'F','F - MLI (SME)'),(6,'G','G - MLI (SME)'),(7,'P','P - MLI (SME)'),(8,'Q','Q - CCLI');
/*!40000 ALTER TABLE `demil_conditions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `disposal_conditions`
--

LOCK TABLES `disposal_conditions` WRITE;
/*!40000 ALTER TABLE `disposal_conditions` DISABLE KEYS */;
INSERT INTO `disposal_conditions` VALUES (1,'N','N - New/Unused'),(2,'U','U - Usable'),(3,'R','R - Repairable'),(4,'X','X - Salvage'),(5,'S','S - Scrap');
/*!40000 ALTER TABLE `disposal_conditions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `permissions`
--

LOCK TABLES `permissions` WRITE;
/*!40000 ALTER TABLE `permissions` DISABLE KEYS */;
INSERT INTO `permissions` VALUES (1,'Manage SASP settings','manage_sasp_settings','Manage settings and preferences for the SASP.',1),(2,'View all organizations','view_all_organizations','View all organizations registered in the system.',1),(3,'View all donee accounts','view_all_donee_accounts','View all accounts related to donee organizations.',1),(4,'View all SASP users','view_all_sasp_users','View all users within the SASP.',1),(5,'View all requests','view_all_requests','View all requests and properties within those requests.',1),(6,'View requests by property ICN','view_requests_by_icn','View all requests that have the same property ICN.',1),(7,'Add new SASP users','add_sasp_users','Add new users to the SASP.',1),(8,'Manage SASP users','manage_sasp_users','Manage SASP users, roles, and permissions.',1),(9,'Manage requests','manage_requests','Manage existing requests within the SASP.',1),(10,'Generate LOAR documents','generate_loar_documents','Generate signed LOAR documents for requests.',1),(11,'Generate invoices','generate_invoices','Generate invoices for requests within the SASP.',1),(12,'Attach files to requests','attach_files_to_requests','Attach files and documents to requests.',NULL),(13,'Review and approve organizations','approve_organizations','Review and approve new organizations registered.',1),(14,'View organization info','view_organization_info','View organization-specific information.',2),(15,'Manage organization info','manage_organization_info','Manage organization-specific information.',2),(16,'Add new organization users','add_organization_users','Add new users within the organization.',2),(17,'Manage organization users','manage_organization_users','Manage users, roles, and permissions within the organization.',2),(18,'Create new requests','create_requests','Create new requests within the organization.',2),(20,'View organization requests','view_organization_requests','View all requests within the organization.',2),(21,'Manage organization requests','manage_organization_requests','Manage all requests within the organization.',2);
/*!40000 ALTER TABLE `permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `property_types`
--

LOCK TABLES `property_types` WRITE;
/*!40000 ALTER TABLE `property_types` DISABLE KEYS */;
INSERT INTO `property_types` VALUES (1,'NR','A - No Special Requirements'),(2,'PR','G - Surplus Proceeds Retention'),(3,'ES','B - Exchange Sale'),(4,'WC','C - Working Capital'),(5,'TS','C- Legislative Auth'),(6,'NA','C - Non-appropriated'),(7,'WM','C - Govt Corporation'),(8,'E','E- Seized and Forfeited'),(9,'F','F- Abandoned/Unclaimed');
/*!40000 ALTER TABLE `property_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `request_attachment_types`
--

LOCK TABLES `request_attachment_types` WRITE;
/*!40000 ALTER TABLE `request_attachment_types` DISABLE KEYS */;
INSERT INTO `request_attachment_types` VALUES (1,'SF-123'),(2,'LOAR'),(3,'Invoice'),(4,'Other');
/*!40000 ALTER TABLE `request_attachment_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `request_statuses`
--

LOCK TABLES `request_statuses` WRITE;
/*!40000 ALTER TABLE `request_statuses` DISABLE KEYS */;
INSERT INTO `request_statuses` VALUES (1,'New Request','#079dfb'),(2,'Sent to GSA','#FDC707'),(3,'Pending Action','#FBA507'),(4,'Canceled','#6C757D'),(5,'Allocated','#28A745'),(6,'Rejected','#DC3545'),(7,'Escalated','#EE6C45'),(8,'Completed','#32CD32');
/*!40000 ALTER TABLE `request_statuses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `role_permissions`
--

LOCK TABLES `role_permissions` WRITE;
/*!40000 ALTER TABLE `role_permissions` DISABLE KEYS */;
INSERT INTO `role_permissions` VALUES (1,1),(1,2),(2,2),(1,3),(2,3),(1,4),(2,4),(1,5),(2,5),(1,6),(2,6),(1,7),(1,8),(1,9),(1,10),(1,11),(1,12),(1,13),(3,14),(4,14),(3,15),(3,16),(3,17),(3,18),(3,20),(4,20),(3,21);
/*!40000 ALTER TABLE `role_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'Admin (SASP)',1,1,NULL),(2,'View Only (SASP)',1,1,NULL),(3,'Admin (Donee)',1,2,NULL),(4,'View Only (Donee)',1,2,NULL);
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `supply_conditions`
--

LOCK TABLES `supply_conditions` WRITE;
/*!40000 ALTER TABLE `supply_conditions` DISABLE KEYS */;
INSERT INTO `supply_conditions` VALUES (1,'A','A - Serviceable - Issuable without Qualification'),(2,'B','B - Serviceable - Issuable with Qualification'),(3,'C','C - Serviceable - Priority Issue'),(4,'D','D - Serviceable - Test/Modification'),(5,'E','E - Unserviceable - Limited Restoration'),(6,'F','F - Unserviceable - Repairable'),(7,'G','G - Unserviceable - Incomplete'),(8,'H','H - Unserviceable - Condemned'),(9,'S','S - Unserviceable - Scrap');
/*!40000 ALTER TABLE `supply_conditions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping data for table `user_types`
--

LOCK TABLES `user_types` WRITE;
/*!40000 ALTER TABLE `user_types` DISABLE KEYS */;
INSERT INTO `user_types` VALUES (2,'Donee'),(1,'SASP');
/*!40000 ALTER TABLE `user_types` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-03-26 15:36:55
