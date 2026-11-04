-- Esquema del catálogo administrativo de companies.
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
  `db_name` varchar(128) DEFAULT NULL,
  `db_username` varchar(128) DEFAULT NULL,
  `db_password_encrypted` varbinary(512) DEFAULT NULL,
  `estado` varchar(20) NOT NULL DEFAULT 'activo',
  PRIMARY KEY (`id`),
  UNIQUE KEY `guid` (`guid`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

SET @company_db_name_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'companies'
     AND column_name = 'db_name') = 0,
  'ALTER TABLE companies ADD COLUMN db_name varchar(128) NULL',
  'SELECT 1'
);
PREPARE company_db_name_stmt FROM @company_db_name_sql;
EXECUTE company_db_name_stmt;
DEALLOCATE PREPARE company_db_name_stmt;

SET @company_db_username_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'companies'
     AND column_name = 'db_username') = 0,
  'ALTER TABLE companies ADD COLUMN db_username varchar(128) NULL',
  'SELECT 1'
);
PREPARE company_db_username_stmt FROM @company_db_username_sql;
EXECUTE company_db_username_stmt;
DEALLOCATE PREPARE company_db_username_stmt;

SET @company_db_password_encrypted_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'companies'
     AND column_name = 'db_password_encrypted') = 0,
  'ALTER TABLE companies ADD COLUMN db_password_encrypted varbinary(512) NULL',
  'SELECT 1'
);
PREPARE company_db_password_encrypted_stmt FROM @company_db_password_encrypted_sql;
EXECUTE company_db_password_encrypted_stmt;
DEALLOCATE PREPARE company_db_password_encrypted_stmt;

-- Permite que las altas del CRUD funcionen en instalaciones que aún tengan
-- las antiguas columnas de credenciales en texto plano, sin volver a usarlas.
SET @company_legacy_database_name_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'companies'
     AND column_name = 'database_name') > 0,
  'ALTER TABLE companies MODIFY COLUMN database_name varchar(128) NULL',
  'SELECT 1'
);
PREPARE company_legacy_database_name_stmt FROM @company_legacy_database_name_sql;
EXECUTE company_legacy_database_name_stmt;
DEALLOCATE PREPARE company_legacy_database_name_stmt;

SET @company_legacy_database_user_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'companies'
     AND column_name = 'database_user') > 0,
  'ALTER TABLE companies MODIFY COLUMN database_user varchar(128) NULL',
  'SELECT 1'
);
PREPARE company_legacy_database_user_stmt FROM @company_legacy_database_user_sql;
EXECUTE company_legacy_database_user_stmt;
DEALLOCATE PREPARE company_legacy_database_user_stmt;

SET @company_legacy_database_password_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'companies'
     AND column_name = 'database_password') > 0,
  'ALTER TABLE companies MODIFY COLUMN database_password text NULL',
  'SELECT 1'
);
PREPARE company_legacy_database_password_stmt FROM @company_legacy_database_password_sql;
EXECUTE company_legacy_database_password_stmt;
DEALLOCATE PREPARE company_legacy_database_password_stmt;
