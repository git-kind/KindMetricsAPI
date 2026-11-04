-- Incremental administrative catalog migration. Safe to run after
-- company-management.sql, which also creates these columns for new installs.
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

-- Las instalaciones anteriores podían exigir estas columnas en texto plano.
-- Se conservan sus datos históricos, pero dejan de ser obligatorias para el CRUD.
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
