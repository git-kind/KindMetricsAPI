-- Upgrade company management procedures for separated registration and provisioning.
-- Run against the kindmetrics database as kindmetrics@%. Only the provisioning
-- procedure uses that DEFINER; catalog procedures use the caller's privileges.

DROP PROCEDURE IF EXISTS sp_company_management_create;
DROP PROCEDURE IF EXISTS sp_company_management_provision_database;
DROP PROCEDURE IF EXISTS sp_company_management_update;

DELIMITER $$

CREATE PROCEDURE sp_company_management_create(
  IN p_guid CHAR(36),
  IN p_data JSON
)
SQL SECURITY INVOKER
BEGIN
  INSERT INTO companies (
    guid, name, code, razon_social, rfc, direccion, telefono,
    status, estado
  )
  VALUES (
    p_guid,
    JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.name')),
    JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.code')),
    JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.razon_social')),
    NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.rfc')), 'null'),
    NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.direccion')), 'null'),
    NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.telefono')), 'null'),
    'INACTIVE',
    'inactivo'
  );

  SELECT id, guid, name, code, razon_social, rfc, direccion, telefono,
         created_at, estado, status
  FROM companies
  WHERE guid = p_guid
  LIMIT 1;
END$$

CREATE DEFINER = 'kindmetrics'@'%' PROCEDURE sp_company_management_provision_database(
  IN p_company_id BIGINT UNSIGNED,
  IN p_database_name VARCHAR(64),
  IN p_database_user VARCHAR(32),
  IN p_password_encrypted VARBINARY(512),
  IN p_database_password VARCHAR(512),
  IN p_application_user VARCHAR(32)
)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_database_identifier VARCHAR(260);
  DECLARE v_statement TEXT;
  DECLARE v_company_count INT DEFAULT 0;
  DECLARE v_pending_retry TINYINT DEFAULT 0;
  DECLARE v_company_exists INT DEFAULT 0;
  DECLARE v_database_exists INT DEFAULT 0;
  DECLARE v_database_created TINYINT DEFAULT 0;
  DECLARE v_user_created TINYINT DEFAULT 0;
  DECLARE v_application_granted TINYINT DEFAULT 0;
  DECLARE v_company_updated TINYINT DEFAULT 0;
  DECLARE v_create_database_prepared TINYINT DEFAULT 0;
  DECLARE v_create_user_prepared TINYINT DEFAULT 0;
  DECLARE v_grant_prepared TINYINT DEFAULT 0;
  DECLARE v_application_grant_prepared TINYINT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_create_database_prepared = 1 THEN
      DEALLOCATE PREPARE company_create_database_stmt;
    END IF;
    IF v_create_user_prepared = 1 THEN
      DEALLOCATE PREPARE company_create_user_stmt;
    END IF;
    IF v_grant_prepared = 1 THEN
      DEALLOCATE PREPARE company_grant_privileges_stmt;
    END IF;
    IF v_application_grant_prepared = 1 THEN
      DEALLOCATE PREPARE company_application_grant_stmt;
    END IF;
    SET @company_management_dynamic_sql = NULL;

    IF v_company_updated = 1 THEN
      UPDATE companies
      SET db_name = NULL,
          db_username = NULL,
          db_password_encrypted = NULL,
          status = 'INACTIVE',
          estado = 'inactivo'
      WHERE id = p_company_id;
    END IF;

    IF v_application_granted = 1 THEN
      SET v_statement = CONCAT(
        'REVOKE ALL PRIVILEGES, GRANT OPTION ON ',
        v_database_identifier,
        '.* FROM ',
        QUOTE(p_application_user),
        '@''%'''
      );
      SET @company_management_dynamic_sql = v_statement;
      PREPARE company_revoke_application_grant_stmt FROM @company_management_dynamic_sql;
      SET @company_management_dynamic_sql = NULL;
      EXECUTE company_revoke_application_grant_stmt;
      DEALLOCATE PREPARE company_revoke_application_grant_stmt;
    END IF;

    IF v_user_created = 1 THEN
      SET v_statement = CONCAT(
        'DROP USER IF EXISTS ',
        QUOTE(p_database_user),
        '@''%'''
      );
      SET @company_management_dynamic_sql = v_statement;
      PREPARE company_drop_user_stmt FROM @company_management_dynamic_sql;
      SET @company_management_dynamic_sql = NULL;
      EXECUTE company_drop_user_stmt;
      DEALLOCATE PREPARE company_drop_user_stmt;
    END IF;

    IF v_database_created = 1 THEN
      SET v_statement = CONCAT('DROP DATABASE IF EXISTS ', v_database_identifier);
      SET @company_management_dynamic_sql = v_statement;
      PREPARE company_drop_database_stmt FROM @company_management_dynamic_sql;
      SET @company_management_dynamic_sql = NULL;
      EXECUTE company_drop_database_stmt;
      DEALLOCATE PREPARE company_drop_database_stmt;
    END IF;
    RESIGNAL;
  END;

  IF p_database_name IS NULL
     OR p_database_name = ''
     OR CHAR_LENGTH(p_database_name) > 64
     OR NOT REGEXP_LIKE(p_database_name, '^[A-Za-z0-9_$-]+$') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'COMPANY_DATABASE_NAME_INVALID';
  END IF;

  IF p_database_user IS NULL
     OR p_database_user = ''
     OR CHAR_LENGTH(p_database_user) > 32 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'COMPANY_DATABASE_USER_INVALID';
  END IF;

  IF p_application_user IS NULL
     OR p_application_user = ''
     OR CHAR_LENGTH(p_application_user) > 32 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'COMPANY_APPLICATION_DATABASE_USER_INVALID';
  END IF;

  IF LOWER(p_database_user) = LOWER(p_application_user) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'COMPANY_DATABASE_USER_CONFLICTS_WITH_APPLICATION_USER';
  END IF;

  IF p_database_password IS NULL OR p_database_password = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'COMPANY_DATABASE_PASSWORD_REQUIRED';
  END IF;

  SELECT COUNT(*)
  INTO v_company_exists
  FROM companies
  WHERE id = p_company_id;
  IF v_company_exists = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'COMPANY_NOT_FOUND';
  END IF;

  SELECT COUNT(*)
  INTO v_company_count
  FROM companies
  WHERE id = p_company_id
    AND (
      db_name IS NOT NULL
      OR db_username IS NOT NULL
      OR db_password_encrypted IS NOT NULL
    );
  IF v_company_count > 0 THEN
    SELECT COUNT(*)
    INTO v_pending_retry
    FROM companies
    WHERE id = p_company_id
      AND UPPER(TRIM(status)) = 'INACTIVE'
      AND db_name = p_database_name
      AND db_username = p_database_user
      AND db_password_encrypted IS NOT NULL;
    IF v_pending_retry = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'COMPANY_DATABASE_ALREADY_PROVISIONED';
    END IF;
  END IF;

  IF v_pending_retry = 0 THEN
    SELECT COUNT(*)
    INTO v_database_exists
    FROM information_schema.schemata
    WHERE schema_name = p_database_name;
    IF v_database_exists > 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'COMPANY_DATABASE_ALREADY_EXISTS';
    END IF;

    SET v_database_identifier = CONCAT('`', REPLACE(p_database_name, '`', '``'), '`');
    SET v_statement = CONCAT(
      'CREATE DATABASE ',
      v_database_identifier,
      ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci'
    );
    SET @company_management_dynamic_sql = v_statement;
    PREPARE company_create_database_stmt FROM @company_management_dynamic_sql;
    SET v_create_database_prepared = 1;
    SET @company_management_dynamic_sql = NULL;
    EXECUTE company_create_database_stmt;
    SET v_database_created = 1;
    DEALLOCATE PREPARE company_create_database_stmt;
    SET v_create_database_prepared = 0;

    SET v_statement = CONCAT(
      'GRANT ALL PRIVILEGES ON ',
      v_database_identifier,
      '.* TO ',
      QUOTE(p_application_user),
      '@''%'''
    );
    SET @company_management_dynamic_sql = v_statement;
    PREPARE company_application_grant_stmt FROM @company_management_dynamic_sql;
    SET v_application_grant_prepared = 1;
    SET @company_management_dynamic_sql = NULL;
    EXECUTE company_application_grant_stmt;
    SET v_application_granted = 1;
    DEALLOCATE PREPARE company_application_grant_stmt;
    SET v_application_grant_prepared = 0;

    SET v_statement = CONCAT(
      'CREATE USER ',
      QUOTE(p_database_user),
      '@''%'' IDENTIFIED BY ',
      QUOTE(p_database_password)
    );
    SET @company_management_dynamic_sql = v_statement;
    PREPARE company_create_user_stmt FROM @company_management_dynamic_sql;
    SET v_create_user_prepared = 1;
    SET @company_management_dynamic_sql = NULL;
    EXECUTE company_create_user_stmt;
    SET v_user_created = 1;
    DEALLOCATE PREPARE company_create_user_stmt;
    SET v_create_user_prepared = 0;

    SET v_statement = CONCAT(
      'GRANT ALL PRIVILEGES ON ',
      v_database_identifier,
      '.* TO ',
      QUOTE(p_database_user),
      '@''%'''
    );
    SET @company_management_dynamic_sql = v_statement;
    PREPARE company_grant_privileges_stmt FROM @company_management_dynamic_sql;
    SET v_grant_prepared = 1;
    SET @company_management_dynamic_sql = NULL;
    EXECUTE company_grant_privileges_stmt;
    DEALLOCATE PREPARE company_grant_privileges_stmt;
    SET v_grant_prepared = 0;

    UPDATE companies
    SET db_name = p_database_name,
        db_username = p_database_user,
        db_password_encrypted = p_password_encrypted,
        status = 'INACTIVE',
        estado = 'inactivo'
    WHERE id = p_company_id;
    SET v_company_updated = 1;
  END IF;

  SELECT id, guid, name, code, razon_social, rfc, direccion, telefono,
         created_at, estado, status
  FROM companies
  WHERE id = p_company_id
  LIMIT 1;
  SET v_company_updated = 0;
  SET v_application_granted = 0;
  SET v_user_created = 0;
  SET v_database_created = 0;
END$$

CREATE PROCEDURE sp_company_management_update(
  IN p_id BIGINT UNSIGNED,
  IN p_data JSON,
  IN p_password_encrypted VARBINARY(512)
)
SQL SECURITY INVOKER
BEGIN
  IF JSON_CONTAINS_PATH(p_data, 'one', '$.estado')
     AND JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.estado')) = 'activo'
     AND NOT EXISTS (
       SELECT 1
       FROM companies
       WHERE id = p_id
         AND db_name IS NOT NULL
         AND db_username IS NOT NULL
         AND db_password_encrypted IS NOT NULL
     ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'COMPANY_DATABASE_NOT_PROVISIONED';
  END IF;

  UPDATE companies
  SET name = IF(JSON_CONTAINS_PATH(p_data, 'one', '$.name'),
                JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.name')), name),
      code = IF(JSON_CONTAINS_PATH(p_data, 'one', '$.code'),
                JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.code')), code),
      razon_social = IF(JSON_CONTAINS_PATH(p_data, 'one', '$.razon_social'),
                JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.razon_social')), razon_social),
      rfc = IF(JSON_CONTAINS_PATH(p_data, 'one', '$.rfc'),
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.rfc')), 'null'), rfc),
      direccion = IF(JSON_CONTAINS_PATH(p_data, 'one', '$.direccion'),
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.direccion')), 'null'), direccion),
      telefono = IF(JSON_CONTAINS_PATH(p_data, 'one', '$.telefono'),
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.telefono')), 'null'), telefono),
      db_name = IF(JSON_CONTAINS_PATH(p_data, 'one', '$.database_name'),
                JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.database_name')), db_name),
      db_username = IF(JSON_CONTAINS_PATH(p_data, 'one', '$.database_user'),
                JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.database_user')), db_username),
      db_password_encrypted = COALESCE(p_password_encrypted, db_password_encrypted),
      estado = IF(JSON_CONTAINS_PATH(p_data, 'one', '$.estado'),
                JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.estado')), estado),
      status = IF(JSON_CONTAINS_PATH(p_data, 'one', '$.estado'),
                IF(JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.estado')) = 'inactivo', 'INACTIVE', 'ACTIVE'),
                status)
  WHERE id = p_id
    AND UPPER(TRIM(status)) <> 'DELETED';

  SELECT id, guid, name, code, razon_social, rfc, direccion, telefono,
         created_at, estado, status
  FROM companies
  WHERE id = p_id
    AND UPPER(TRIM(status)) <> 'DELETED'
  LIMIT 1;
END$$

DELIMITER ;
