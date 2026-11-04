-- Align the administrative users and companies modules with the KindErickV2
-- procedure contracts while retaining KindMetrics connection credentials.
-- Safe to re-run; no user or company rows are deleted.
-- Run after 0000-users-schema.sql, company-management.sql,
-- 0001-company-database-connection.sql, and user-company-access.sql.

SET @user_profile_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'perfil'
);
SET @user_profile_migration_sql = IF(
  @user_profile_column_exists = 0,
  'ALTER TABLE users ADD COLUMN perfil varchar(20) NOT NULL DEFAULT ''Visor''',
  'SELECT 1'
);
PREPARE user_profile_migration_stmt FROM @user_profile_migration_sql;
EXECUTE user_profile_migration_stmt;
DEALLOCATE PREPARE user_profile_migration_stmt;

-- Preserve platform administrators' existing company-management access.
UPDATE users
SET perfil = 'Admin'
WHERE is_platform_admin = 1
  AND perfil = 'Visor';

SET @company_razon_social_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'companies'
     AND column_name = 'razon_social') = 0,
  'ALTER TABLE companies ADD COLUMN razon_social varchar(255) NULL',
  'SELECT 1'
);
PREPARE company_razon_social_stmt FROM @company_razon_social_sql;
EXECUTE company_razon_social_stmt;
DEALLOCATE PREPARE company_razon_social_stmt;

SET @company_rfc_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'companies'
     AND column_name = 'rfc') = 0,
  'ALTER TABLE companies ADD COLUMN rfc varchar(50) NULL',
  'SELECT 1'
);
PREPARE company_rfc_stmt FROM @company_rfc_sql;
EXECUTE company_rfc_stmt;
DEALLOCATE PREPARE company_rfc_stmt;

SET @company_direccion_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'companies'
     AND column_name = 'direccion') = 0,
  'ALTER TABLE companies ADD COLUMN direccion varchar(255) NULL',
  'SELECT 1'
);
PREPARE company_direccion_stmt FROM @company_direccion_sql;
EXECUTE company_direccion_stmt;
DEALLOCATE PREPARE company_direccion_stmt;

SET @company_telefono_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'companies'
     AND column_name = 'telefono') = 0,
  'ALTER TABLE companies ADD COLUMN telefono varchar(50) NULL',
  'SELECT 1'
);
PREPARE company_telefono_stmt FROM @company_telefono_sql;
EXECUTE company_telefono_stmt;
DEALLOCATE PREPARE company_telefono_stmt;

SET @company_estado_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'companies'
     AND column_name = 'estado') = 0,
  'ALTER TABLE companies ADD COLUMN estado varchar(20) NOT NULL DEFAULT ''activo''',
  'SELECT 1'
);
PREPARE company_estado_stmt FROM @company_estado_sql;
EXECUTE company_estado_stmt;
DEALLOCATE PREPARE company_estado_stmt;

UPDATE companies
SET razon_social = name
WHERE razon_social IS NULL OR TRIM(razon_social) = '';

UPDATE companies
SET estado = CASE
  WHEN UPPER(TRIM(status)) IN ('INACTIVE', 'INACTIVO', 'DELETED') THEN 'inactivo'
  ELSE 'activo'
END
WHERE estado IS NULL OR TRIM(estado) = '';

ALTER TABLE companies
  MODIFY COLUMN razon_social varchar(255) NOT NULL,
  MODIFY COLUMN db_name varchar(128) NULL,
  MODIFY COLUMN db_username varchar(128) NULL;

DROP PROCEDURE IF EXISTS sp_companies_list;
DROP PROCEDURE IF EXISTS sp_companies_get;
DROP PROCEDURE IF EXISTS sp_companies_create;
DROP PROCEDURE IF EXISTS sp_companies_update;
DROP PROCEDURE IF EXISTS sp_companies_delete;
DROP PROCEDURE IF EXISTS sp_users_create;
DROP PROCEDURE IF EXISTS sp_users_list;
DROP PROCEDURE IF EXISTS sp_users_update;
DROP PROCEDURE IF EXISTS sp_users_delete;

DELIMITER $$

CREATE PROCEDURE sp_companies_list(IN p_company_id BIGINT)
BEGIN
  SELECT id, guid, name, code, description, timezone, locale, config,
         is_primary, status, created_at, updated_at, razon_social, rfc,
         direccion, telefono, estado
  FROM companies
  WHERE status <> 'DELETED'
  ORDER BY id DESC
  LIMIT 500;
END$$

CREATE PROCEDURE sp_companies_get(IN p_guid CHAR(36), IN p_company_id BIGINT)
BEGIN
  SELECT id, guid, name, code, description, timezone, locale, config,
         is_primary, status, created_at, updated_at, razon_social, rfc,
         direccion, telefono, estado
  FROM companies
  WHERE guid = p_guid
    AND status <> 'DELETED'
  LIMIT 1;
END$$

CREATE PROCEDURE sp_companies_create(
  IN p_guid CHAR(36),
  IN p_company_id BIGINT,
  IN p_data JSON,
  IN p_actor_id BIGINT
)
BEGIN
  DECLARE v_name VARCHAR(160);
  SET v_name = JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.name'));

  INSERT INTO companies (
    guid, name, code, description, timezone, locale, config,
    razon_social, rfc, direccion, telefono, status, estado
  )
  VALUES (
    p_guid,
    v_name,
    JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.code')),
    JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.description')),
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.timezone')), 'UTC'),
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.locale')), 'es'),
    JSON_EXTRACT(p_data, '$.config'),
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.razon_social')), v_name),
    JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.rfc')),
    JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.direccion')),
    JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.telefono')),
    'ACTIVE',
    'activo'
  );

  SELECT id, guid, name, code, description, timezone, locale, config,
         is_primary, status, created_at, updated_at, razon_social, rfc,
         direccion, telefono, estado
  FROM companies
  WHERE guid = p_guid
  LIMIT 1;
END$$

CREATE PROCEDURE sp_companies_update(
  IN p_guid CHAR(36),
  IN p_company_id BIGINT,
  IN p_data JSON,
  IN p_actor_id BIGINT
)
BEGIN
  UPDATE companies
  SET name = IF(
        JSON_CONTAINS_PATH(p_data, 'one', '$.name'),
        JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.name')),
        name
      ),
      code = IF(
        JSON_CONTAINS_PATH(p_data, 'one', '$.code'),
        JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.code')),
        code
      ),
      description = IF(
        JSON_CONTAINS_PATH(p_data, 'one', '$.description'),
        JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.description')),
        description
      ),
      timezone = IF(
        JSON_CONTAINS_PATH(p_data, 'one', '$.timezone'),
        JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.timezone')),
        timezone
      ),
      locale = IF(
        JSON_CONTAINS_PATH(p_data, 'one', '$.locale'),
        JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.locale')),
        locale
      ),
      config = IF(
        JSON_CONTAINS_PATH(p_data, 'one', '$.config'),
        JSON_EXTRACT(p_data, '$.config'),
        config
      ),
      razon_social = IF(
        JSON_CONTAINS_PATH(p_data, 'one', '$.razon_social'),
        JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.razon_social')),
        razon_social
      ),
      rfc = IF(
        JSON_CONTAINS_PATH(p_data, 'one', '$.rfc'),
        JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.rfc')),
        rfc
      ),
      direccion = IF(
        JSON_CONTAINS_PATH(p_data, 'one', '$.direccion'),
        JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.direccion')),
        direccion
      ),
      telefono = IF(
        JSON_CONTAINS_PATH(p_data, 'one', '$.telefono'),
        JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.telefono')),
        telefono
      ),
      estado = IF(
        JSON_CONTAINS_PATH(p_data, 'one', '$.estado'),
        JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.estado')),
        estado
      )
  WHERE guid = p_guid
    AND status <> 'DELETED';

  SELECT id, guid, name, code, description, timezone, locale, config,
         is_primary, status, created_at, updated_at, razon_social, rfc,
         direccion, telefono, estado
  FROM companies
  WHERE guid = p_guid
    AND status <> 'DELETED'
  LIMIT 1;
END$$

CREATE PROCEDURE sp_companies_delete(
  IN p_guid CHAR(36),
  IN p_company_id BIGINT,
  IN p_actor_id BIGINT
)
BEGIN
  DECLARE v_affected_rows INT DEFAULT 0;

  UPDATE companies
  SET status = 'DELETED',
      estado = 'inactivo'
  WHERE guid = p_guid
    AND status <> 'DELETED';

  SET v_affected_rows = ROW_COUNT();

  IF v_affected_rows > 0 THEN
    SELECT id, guid, name, code, description, timezone, locale, config,
           is_primary, status, created_at, updated_at, razon_social, rfc,
           direccion, telefono, estado
    FROM companies
    WHERE guid = p_guid
    LIMIT 1;
  END IF;
END$$

CREATE PROCEDURE sp_users_create(
  IN p_guid CHAR(36),
  IN p_email VARCHAR(255),
  IN p_name VARCHAR(160),
  IN p_hash VARCHAR(255),
  IN p_company_id BIGINT,
  IN p_actor_id BIGINT
)
BEGIN
  DECLARE v_id BIGINT UNSIGNED;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  INSERT INTO users (guid, email, name, password_hash)
  VALUES (p_guid, p_email, p_name, p_hash);
  SET v_id = LAST_INSERT_ID();

  IF p_company_id IS NOT NULL THEN
    INSERT INTO user_company_access (user_id, company_id, status)
    VALUES (v_id, p_company_id, 'ACTIVE');
  END IF;

  COMMIT;

  SELECT guid, email, name, status
  FROM users
  WHERE id = v_id;
END$$

CREATE PROCEDURE sp_users_list(IN p_company_id BIGINT)
BEGIN
  SELECT u.guid, u.email, u.name, u.status
  FROM users AS u
  INNER JOIN user_company_access AS a
    ON a.user_id = u.id
   AND a.company_id = p_company_id
   AND a.status = 'ACTIVE'
  WHERE u.status <> 'DELETED'
  ORDER BY u.id DESC
  LIMIT 500;
END$$

CREATE PROCEDURE sp_users_update(
  IN p_guid CHAR(36),
  IN p_company_id BIGINT,
  IN p_data JSON,
  IN p_actor_id BIGINT
)
BEGIN
  UPDATE users AS u
  INNER JOIN user_company_access AS a
    ON a.user_id = u.id
   AND a.company_id = p_company_id
   AND a.status = 'ACTIVE'
  SET u.name = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.name')), u.name)
  WHERE u.guid = p_guid
    AND u.status = 'ACTIVE';

  SELECT u.guid, u.email, u.name, u.status
  FROM users AS u
  INNER JOIN user_company_access AS a
    ON a.user_id = u.id
   AND a.company_id = p_company_id
   AND a.status = 'ACTIVE'
  WHERE u.guid = p_guid
    AND u.status = 'ACTIVE'
  LIMIT 1;
END$$

CREATE PROCEDURE sp_users_delete(
  IN p_guid CHAR(36),
  IN p_company_id BIGINT,
  IN p_actor_id BIGINT
)
BEGIN
  UPDATE user_company_access AS a
  INNER JOIN users AS u
    ON u.id = a.user_id
  SET a.status = 'INACTIVE'
  WHERE u.guid = p_guid
    AND u.status IN ('ACTIVE', 'ACTIVO')
    AND a.company_id = p_company_id
    AND a.status = 'ACTIVE';

  IF ROW_COUNT() > 0 THEN
    SELECT guid, email, name, status
    FROM users
    WHERE guid = p_guid
    LIMIT 1;
  END IF;
END$$

DELIMITER ;
