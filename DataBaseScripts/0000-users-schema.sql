-- Users table used by KindErickV2 authentication and company-access procedures.
-- `perfil` is required by the sp_user_company_access_* result contract.
CREATE TABLE IF NOT EXISTS `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `guid` char(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `name` varchar(160) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  `is_platform_admin` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `perfil` varchar(20) NOT NULL DEFAULT 'Visor',
  PRIMARY KEY (`id`),
  UNIQUE KEY `guid` (`guid`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;
