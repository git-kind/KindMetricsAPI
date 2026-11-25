-- RBAC stored-procedure result contract.
-- Run in the central KindMetrics_Erick database after 0013-rbac-schema-seed.sql.
-- Auth procedure parameter counts match AuthRepository call sites:
-- one email for sp_auth_by_email and one guid for sp_auth_by_guid.
-- User-management procedure signatures are unchanged from 0010.
-- Dashboard stored procedures are intentionally unchanged: API role middleware
-- rejects Viewer before any dashboard controller or tenant procedure is called.

DROP PROCEDURE IF EXISTS sp_auth_by_email;
DROP PROCEDURE IF EXISTS sp_auth_by_guid;
DROP PROCEDURE IF EXISTS sp_company_management_user_profile;
DROP PROCEDURE IF EXISTS sp_user_management_list;
DROP PROCEDURE IF EXISTS sp_user_management_get_by_id;
DROP PROCEDURE IF EXISTS sp_user_management_create;
DROP PROCEDURE IF EXISTS sp_user_management_update;

DELIMITER $$

CREATE PROCEDURE sp_auth_by_email(IN p_email VARCHAR(255))
SQL SECURITY INVOKER
BEGIN
  SELECT
    id,
    guid,
    email,
    name,
    password_hash,
    is_platform_admin,
    status,
    perfil,
    CASE
      WHEN UPPER(TRIM(perfil)) = 'VISOR' THEN 'Viewer'
      ELSE perfil
    END AS role
  FROM users
  WHERE LOWER(email) = LOWER(p_email)
  LIMIT 1;
END$$

CREATE PROCEDURE sp_auth_by_guid(IN p_guid CHAR(36))
SQL SECURITY INVOKER
BEGIN
  SELECT
    id,
    guid,
    email,
    name,
    password_hash,
    is_platform_admin,
    status,
    perfil,
    CASE
      WHEN UPPER(TRIM(perfil)) = 'VISOR' THEN 'Viewer'
      ELSE perfil
    END AS role
  FROM users
  WHERE guid = p_guid
  LIMIT 1;
END$$

CREATE PROCEDURE sp_company_management_user_profile(IN p_user_guid CHAR(36))
SQL SECURITY INVOKER
BEGIN
  SELECT
    perfil,
    CASE
      WHEN UPPER(TRIM(perfil)) = 'VISOR' THEN 'Viewer'
      ELSE perfil
    END AS role
  FROM users
  WHERE guid = p_user_guid
    AND UPPER(TRIM(status)) = 'ACTIVE'
  LIMIT 1;
END$$

CREATE PROCEDURE sp_user_management_list()
SQL SECURITY INVOKER
BEGIN
  SELECT
    id,
    name,
    email,
    perfil,
    CASE
      WHEN UPPER(TRIM(perfil)) = 'VISOR' THEN 'Viewer'
      ELSE perfil
    END AS role
  FROM users
  WHERE UPPER(TRIM(status)) = 'ACTIVE'
  ORDER BY id DESC
  LIMIT 500;
END$$

CREATE PROCEDURE sp_user_management_get_by_id(IN p_id BIGINT UNSIGNED)
SQL SECURITY INVOKER
BEGIN
  SELECT
    id,
    name,
    email,
    perfil,
    CASE
      WHEN UPPER(TRIM(perfil)) = 'VISOR' THEN 'Viewer'
      ELSE perfil
    END AS role
  FROM users
  WHERE id = p_id
    AND UPPER(TRIM(status)) = 'ACTIVE'
  LIMIT 1;
END$$

CREATE PROCEDURE sp_user_management_create(
  IN p_guid CHAR(36),
  IN p_email VARCHAR(255),
  IN p_name VARCHAR(160),
  IN p_perfil VARCHAR(20),
  IN p_password_hash VARCHAR(255)
)
SQL SECURITY INVOKER
BEGIN
  INSERT INTO users (guid, email, name, perfil, password_hash, status)
  VALUES (p_guid, p_email, p_name, p_perfil, p_password_hash, 'ACTIVE');

  SELECT
    id,
    name,
    email,
    perfil,
    CASE
      WHEN UPPER(TRIM(perfil)) = 'VISOR' THEN 'Viewer'
      ELSE perfil
    END AS role
  FROM users
  WHERE guid = p_guid
  LIMIT 1;
END$$

CREATE PROCEDURE sp_user_management_update(
  IN p_id BIGINT UNSIGNED,
  IN p_data JSON
)
SQL SECURITY INVOKER
BEGIN
  UPDATE users
  SET name = IF(JSON_CONTAINS_PATH(p_data, 'one', '$.name'),
                JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.name')), name),
      email = IF(JSON_CONTAINS_PATH(p_data, 'one', '$.email'),
                JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.email')), email),
      perfil = IF(JSON_CONTAINS_PATH(p_data, 'one', '$.perfil'),
                JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.perfil')), perfil),
      password_hash = IF(JSON_CONTAINS_PATH(p_data, 'one', '$.password_hash'),
                JSON_UNQUOTE(JSON_EXTRACT(p_data, '$.password_hash')), password_hash)
  WHERE id = p_id
    AND UPPER(TRIM(status)) = 'ACTIVE';

  SELECT
    id,
    name,
    email,
    perfil,
    CASE
      WHEN UPPER(TRIM(perfil)) = 'VISOR' THEN 'Viewer'
      ELSE perfil
    END AS role
  FROM users
  WHERE id = p_id
    AND UPPER(TRIM(status)) = 'ACTIVE'
  LIMIT 1;
END$$

DELIMITER ;
