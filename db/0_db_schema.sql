CREATE DATABASE  IF NOT EXISTS `americansurplus` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `americansurplus`;
-- MySQL dump 10.13  Distrib 8.0.38, for Win64 (x86_64)
--
-- Host: localhost    Database: americansurplus
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
-- Table structure for table `demil_conditions`
--

DROP TABLE IF EXISTS `demil_conditions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `demil_conditions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(45) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  UNIQUE KEY `demil_condition_id_UNIQUE` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='	';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `disposal_conditions`
--

DROP TABLE IF EXISTS `disposal_conditions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `disposal_conditions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(45) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  UNIQUE KEY `disposal_condition_id_UNIQUE` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `donee_accounts`
--

DROP TABLE IF EXISTS `donee_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `donee_accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(45) DEFAULT NULL,
  `organizationId` varchar(36) NOT NULL,
  `stateId` int NOT NULL,
  `isActive` tinyint NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `donee_account_id_UNIQUE` (`id`),
  UNIQUE KEY `name_UNIQUE` (`name`),
  KEY `donee_account_organization_idx` (`organizationId`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `organization_users`
--

DROP TABLE IF EXISTS `organization_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `organization_users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(36) NOT NULL,
  `organizationId` varchar(36) DEFAULT NULL,
  `createdAt` date DEFAULT NULL,
  `updatedAt` date DEFAULT NULL,
  `owner` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  KEY `organization_representatives_idx` (`userId`),
  KEY `fk_organization_users_idx_idx` (`organizationId`),
  CONSTRAINT `fk_organization_users_idx` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`),
  CONSTRAINT `representative_user` FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=81 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `organizations`
--

DROP TABLE IF EXISTS `organizations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `organizations` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `address` varchar(255) NOT NULL,
  `phone` varchar(255) NOT NULL,
  `createdAt` date DEFAULT NULL,
  `updatedAt` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `organization_id_UNIQUE` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `permissions`
--

DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `identifier` varchar(45) NOT NULL,
  `description` varchar(255) NOT NULL,
  `user_type_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `permission_id_UNIQUE` (`id`),
  KEY `fk_permissions_user_type_idx _idx` (`user_type_id`),
  CONSTRAINT `fk_permissions_user_type_idx ` FOREIGN KEY (`user_type_id`) REFERENCES `user_types` (`user_type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `properties`
--

DROP TABLE IF EXISTS `properties`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `properties` (
  `property_id` int NOT NULL AUTO_INCREMENT,
  `request_id` int NOT NULL,
  `property_reimbursable` tinyint(1) NOT NULL,
  `property_control_number` varchar(36) NOT NULL,
  `property_surplus_release_date` bigint NOT NULL DEFAULT '0',
  `property_name` varchar(255) NOT NULL,
  `property_type` varchar(255) NOT NULL,
  `property_description` varchar(3000) NOT NULL,
  `property_justification` varchar(100) NOT NULL,
  `property_quantity` int NOT NULL,
  `property_original_value` decimal(10,2) NOT NULL,
  `property_total_value` decimal(10,2) NOT NULL,
  `property_fair_market_value` decimal(10,2) DEFAULT NULL,
  `property_disposal_condition` varchar(255) DEFAULT NULL,
  `property_supply_condition` varchar(255) DEFAULT NULL,
  `property_demil_condition` varchar(255) DEFAULT NULL,
  `property_location_address_one` varchar(255) DEFAULT NULL,
  `property_location_address_two` varchar(255) DEFAULT NULL,
  `property_location_address_three` varchar(255) DEFAULT NULL,
  `property_location_city` varchar(255) DEFAULT NULL,
  `property_location_region_state` varchar(255) DEFAULT NULL,
  `property_location_postal_code` varchar(20) DEFAULT NULL,
  `property_poc_name` varchar(255) DEFAULT NULL,
  `property_poc_phone` varchar(255) DEFAULT NULL,
  `property_poc_email` varchar(255) DEFAULT NULL,
  `property_poc_email_cc` varchar(255) DEFAULT NULL,
  `property_custodian_reporting_agency` varchar(255) DEFAULT NULL,
  `property_custodian_name` varchar(255) DEFAULT NULL,
  `property_custodian_phone` varchar(255) DEFAULT NULL,
  `property_custodian_email` varchar(255) DEFAULT NULL,
  `property_custodian_email_cc` varchar(255) DEFAULT NULL,
  `property_allocated_date` bigint DEFAULT NULL,
  `property_cancellation_reason` varchar(500) DEFAULT NULL,
  `createdAt` date DEFAULT NULL,
  `updatedAt` date DEFAULT NULL,
  PRIMARY KEY (`property_id`),
  KEY `property_type_idx` (`property_type`),
  KEY `property_demil_condition_idx` (`property_demil_condition`),
  KEY `property_disposal_condition_idx` (`property_disposal_condition`),
  KEY `property_supply_condition_idx` (`property_supply_condition`),
  KEY `property_demil_condition_x_idx` (`property_demil_condition`),
  KEY `property_disposal_condition_x_idx` (`property_disposal_condition`),
  KEY `poperty_type_x_idx` (`property_type`),
  KEY `property_supply_condition_x_idx` (`property_supply_condition`),
  KEY `request_id_idx` (`request_id`),
  CONSTRAINT `poperty_type_x` FOREIGN KEY (`property_type`) REFERENCES `property_types` (`code`),
  CONSTRAINT `property_demil_condition_x` FOREIGN KEY (`property_demil_condition`) REFERENCES `demil_conditions` (`code`),
  CONSTRAINT `property_disposal_condition_x` FOREIGN KEY (`property_disposal_condition`) REFERENCES `disposal_conditions` (`code`),
  CONSTRAINT `property_supply_condition_x` FOREIGN KEY (`property_supply_condition`) REFERENCES `supply_conditions` (`code`),
  CONSTRAINT `request` FOREIGN KEY (`request_id`) REFERENCES `requests` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=117 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `property_types`
--

DROP TABLE IF EXISTS `property_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `property_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(45) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  UNIQUE KEY `property_type_id_UNIQUE` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `request_attachment_types`
--

DROP TABLE IF EXISTS `request_attachment_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `request_attachment_types` (
  `id` int NOT NULL,
  `name` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `request_attachments`
--

DROP TABLE IF EXISTS `request_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `request_attachments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(45) NOT NULL,
  `request_id` int NOT NULL,
  `attachment_type` int NOT NULL,
  `file_path` varchar(2048) NOT NULL,
  `created_by` varchar(36) NOT NULL,
  `updated_date` bigint DEFAULT NULL,
  `created_date` bigint NOT NULL,
  `updated_by` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  KEY `fk_attachments_request_idx_idx` (`request_id`),
  KEY `fk_attachments_type_idx_idx` (`attachment_type`),
  KEY `fk_attachments_created_by_user_idx_idx` (`created_by`),
  KEY `fk_attachments_updated_by_user_idx_idx` (`updated_by`),
  CONSTRAINT `fk_attachments_created_by_user_idx` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_attachments_request_idx` FOREIGN KEY (`request_id`) REFERENCES `requests` (`id`),
  CONSTRAINT `fk_attachments_type_idx` FOREIGN KEY (`attachment_type`) REFERENCES `request_attachment_types` (`id`),
  CONSTRAINT `fk_attachments_updated_by_user_idx` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `request_comments`
--

DROP TABLE IF EXISTS `request_comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `request_comments` (
  `comment_id` int NOT NULL AUTO_INCREMENT,
  `comment_sender` varchar(36) DEFAULT NULL,
  `request_id` int DEFAULT NULL,
  `comment_created_at` bigint DEFAULT NULL,
  `comment_content` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`comment_id`),
  UNIQUE KEY `message_id_UNIQUE` (`comment_id`),
  KEY `property_request_idx` (`request_id`),
  KEY `message_sender_idx` (`comment_sender`),
  CONSTRAINT `request_id` FOREIGN KEY (`request_id`) REFERENCES `requests` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=78 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `request_statuses`
--

DROP TABLE IF EXISTS `request_statuses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `request_statuses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(45) DEFAULT NULL,
  `color` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `requests`
--

DROP TABLE IF EXISTS `requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `requestor` varchar(36) NOT NULL,
  `donee_account` int NOT NULL,
  `tcn` varchar(45) DEFAULT NULL,
  `status` int NOT NULL DEFAULT '1',
  `createdAt` datetime DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `requestor_idx` (`requestor`),
  KEY `donee account_idx` (`donee_account`),
  KEY `status_idx` (`status`),
  CONSTRAINT `donee account` FOREIGN KEY (`donee_account`) REFERENCES `donee_accounts` (`id`),
  CONSTRAINT `requestor` FOREIGN KEY (`requestor`) REFERENCES `users` (`id`),
  CONSTRAINT `status` FOREIGN KEY (`status`) REFERENCES `request_statuses` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=61 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `role_permissions`
--

DROP TABLE IF EXISTS `role_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_permissions` (
  `role_id` int NOT NULL,
  `permission_id` int NOT NULL,
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `role_permissions_ibfk_2_idx` (`permission_id`),
  CONSTRAINT `role_permissions_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`),
  CONSTRAINT `role_permissions_ibfk_2` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `role_id` int NOT NULL AUTO_INCREMENT,
  `role_name` varchar(50) NOT NULL,
  `role_default` tinyint(1) NOT NULL DEFAULT '0',
  `user_type_id` int NOT NULL,
  `organization_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`role_id`),
  KEY `fk_roles_user_type_idx_idx` (`organization_id`),
  CONSTRAINT `fk_roles_user_type_idx` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `state_disposal_fees`
--

DROP TABLE IF EXISTS `state_disposal_fees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `state_disposal_fees` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stateId` int NOT NULL,
  `disposalConditionId` int NOT NULL,
  `fee` double NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `states`
--

DROP TABLE IF EXISTS `states`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `states` (
  `stateId` int NOT NULL,
  `stateName` varchar(45) NOT NULL,
  PRIMARY KEY (`stateId`),
  UNIQUE KEY `stateId_UNIQUE` (`stateId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `supply_conditions`
--

DROP TABLE IF EXISTS `supply_conditions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `supply_conditions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(45) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  UNIQUE KEY `supply_condition_id_UNIQUE` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_roles`
--

DROP TABLE IF EXISTS `user_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_roles` (
  `user_id` varchar(36) NOT NULL,
  `role_id` int NOT NULL,
  PRIMARY KEY (`user_id`,`role_id`),
  KEY `user_roles_ibfk_2` (`role_id`),
  CONSTRAINT `user_roles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `user_roles_ibfk_2` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_sessions`
--

DROP TABLE IF EXISTS `user_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_sessions` (
  `sessionId` char(36) NOT NULL,
  `userId` char(36) NOT NULL,
  `refreshToken` varchar(255) NOT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `expiredAt` datetime DEFAULT NULL,
  `deviceInfo` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`sessionId`),
  UNIQUE KEY `refresh_token` (`refreshToken`),
  KEY `fk_user_sessions_user_id` (`userId`),
  CONSTRAINT `fk_user_sessions_user_id` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_types`
--

DROP TABLE IF EXISTS `user_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_types` (
  `user_type_id` int NOT NULL AUTO_INCREMENT,
  `user_type_name` varchar(50) NOT NULL,
  PRIMARY KEY (`user_type_id`),
  UNIQUE KEY `user_type_name` (`user_type_name`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` varchar(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `name` varchar(45) NOT NULL,
  `password` varchar(255) NOT NULL,
  `typeId` int NOT NULL,
  `isActive` tinyint DEFAULT '1',
  `createdAt` date NOT NULL,
  `updatedAt` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id_UNIQUE` (`id`),
  UNIQUE KEY `user_username_UNIQUE` (`email`),
  KEY `fk_usesr_user_type_idx _idx` (`typeId`),
  CONSTRAINT `fk_users_user_type_idx ` FOREIGN KEY (`typeId`) REFERENCES `user_types` (`user_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-03-26 15:34:29
