-- Esquema de referencia para la tabla companies.
-- No modifica la tabla si ya existe; el CRUD usa los nombres y nulabilidad
-- definidos aquí y preserva las columnas de la arquitectura multiempresa.
CREATE TABLE IF NOT EXISTS `companies` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `guid` char(36) NOT NULL,
  `name` varchar(160) NOT NULL,
  `code` varchar(40) NOT NULL,
  `description` text,
  `timezone` varchar(80) NOT NULL DEFAULT 'UTC',
  `locale` varchar(5) NOT NULL DEFAULT 'es',
  `config` json DEFAULT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `razon_social` varchar(255) NOT NULL,
  `rfc` varchar(50) DEFAULT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  `database_name` varchar(128) NOT NULL,
  `database_user` varchar(128) NOT NULL,
  `database_password` text NOT NULL,
  `estado` varchar(50) DEFAULT 'activo',
  PRIMARY KEY (`id`),
  UNIQUE KEY `guid` (`guid`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

SET @company_database_name_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'companies'
     AND column_name = 'database_name') = 0,
  'ALTER TABLE companies ADD COLUMN database_name varchar(128) NULL',
  'SELECT 1'
);
PREPARE company_database_name_stmt FROM @company_database_name_sql;
EXECUTE company_database_name_stmt;
DEALLOCATE PREPARE company_database_name_stmt;

SET @company_database_user_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'companies'
     AND column_name = 'database_user') = 0,
  'ALTER TABLE companies ADD COLUMN database_user varchar(128) NULL',
  'SELECT 1'
);
PREPARE company_database_user_stmt FROM @company_database_user_sql;
EXECUTE company_database_user_stmt;
DEALLOCATE PREPARE company_database_user_stmt;

SET @company_database_password_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'companies'
     AND column_name = 'database_password') = 0,
  'ALTER TABLE companies ADD COLUMN database_password text NULL',
  'SELECT 1'
);
PREPARE company_database_password_stmt FROM @company_database_password_sql;
EXECUTE company_database_password_stmt;
DEALLOCATE PREPARE company_database_password_stmt;
