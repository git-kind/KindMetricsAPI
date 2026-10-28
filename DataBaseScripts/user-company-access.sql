-- Relación muchos-a-muchos: un usuario puede tener acceso a varias empresas.
-- La clave compuesta impide duplicar la asignación del mismo usuario/empresa.
CREATE TABLE IF NOT EXISTS `user_company_access` (
  `user_id` bigint unsigned NOT NULL,
  `company_id` bigint unsigned NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (`user_id`, `company_id`),
  KEY `company_id` (`company_id`),
  CONSTRAINT `user_company_access_ibfk_1`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `user_company_access_ibfk_2`
    FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

DROP PROCEDURE IF EXISTS `sp_user_company_access_users`;
DROP PROCEDURE IF EXISTS `sp_user_company_access_companies`;
DROP PROCEDURE IF EXISTS `sp_user_company_access_replace`;

DELIMITER //

CREATE PROCEDURE `sp_user_company_access_users`()
BEGIN
  SELECT
    u.id,
    u.guid,
    u.name,
    u.email,
    u.perfil,
    COALESCE(
      (
        SELECT JSON_ARRAYAGG(assigned.company_id)
        FROM (
          SELECT DISTINCT user_id, company_id
          FROM user_company_access
          WHERE UPPER(TRIM(status)) = 'ACTIVE'
        ) AS assigned
        WHERE assigned.user_id = u.id
      ),
      JSON_ARRAY()
    ) AS companyIds
  FROM users AS u
  WHERE UPPER(TRIM(u.status)) IN ('ACTIVE', 'ACTIVO')
  ORDER BY u.name, u.email;
END//

CREATE PROCEDURE `sp_user_company_access_companies`()
BEGIN
  SELECT id, name, code
  FROM companies
  WHERE UPPER(TRIM(status)) = 'ACTIVE'
  ORDER BY name, code;
END//

CREATE PROCEDURE `sp_user_company_access_replace`(
  IN p_user_guid CHAR(36),
  IN p_company_ids JSON
)
BEGIN
  DECLARE v_user_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_requested_count INT UNSIGNED DEFAULT 0;
  DECLARE v_valid_count INT UNSIGNED DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  IF p_company_ids IS NULL OR JSON_TYPE(p_company_ids) <> 'ARRAY' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'INVALID_COMPANY_ASSIGNMENT: companyIds debe ser una lista.';
  END IF;

  SELECT id
  INTO v_user_id
  FROM users
  WHERE guid = p_user_guid
    AND UPPER(TRIM(status)) IN ('ACTIVE', 'ACTIVO')
  LIMIT 1
  FOR UPDATE;

  IF v_user_id IS NOT NULL THEN
    SELECT COUNT(DISTINCT requested.company_id)
    INTO v_requested_count
    FROM JSON_TABLE(
      p_company_ids,
      '$[*]' COLUMNS (company_id BIGINT UNSIGNED PATH '$' ERROR ON ERROR)
    ) AS requested;

    SELECT COUNT(DISTINCT requested.company_id)
    INTO v_valid_count
    FROM JSON_TABLE(
      p_company_ids,
      '$[*]' COLUMNS (company_id BIGINT UNSIGNED PATH '$' ERROR ON ERROR)
    ) AS requested
    INNER JOIN companies AS c
      ON c.id = requested.company_id
     AND UPPER(TRIM(c.status)) = 'ACTIVE';

    IF v_requested_count <> v_valid_count THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'INVALID_COMPANY_ASSIGNMENT: una o más empresas no existen o están inactivas.';
    END IF;

    UPDATE user_company_access
    SET status = 'INACTIVE'
    WHERE user_id = v_user_id;

    INSERT INTO user_company_access (user_id, company_id, status)
    SELECT DISTINCT v_user_id, requested.company_id, 'ACTIVE'
    FROM JSON_TABLE(
      p_company_ids,
      '$[*]' COLUMNS (company_id BIGINT UNSIGNED PATH '$' ERROR ON ERROR)
    ) AS requested
    ON DUPLICATE KEY UPDATE status = 'ACTIVE';
  END IF;

  COMMIT;

  SELECT
    u.id,
    u.guid,
    u.name,
    u.email,
    u.perfil,
    COALESCE(
      (
        SELECT JSON_ARRAYAGG(assigned.company_id)
        FROM (
          SELECT DISTINCT user_id, company_id
          FROM user_company_access
          WHERE UPPER(TRIM(status)) = 'ACTIVE'
        ) AS assigned
        WHERE assigned.user_id = u.id
      ),
      JSON_ARRAY()
    ) AS companyIds
  FROM users AS u
  WHERE u.id = v_user_id;
END//

DELIMITER ;
