-- Limit non-admin company selection to explicit user_company_access grants.
-- Run in the central KindMetrics database after user-company-access.sql.

DROP PROCEDURE IF EXISTS sp_user_available_companies;

DELIMITER $$

CREATE PROCEDURE sp_user_available_companies(IN p_user_guid CHAR(36))
SQL SECURITY INVOKER
BEGIN
  SELECT c.id, c.name, c.code
  FROM users AS u
  INNER JOIN user_company_access AS a
    ON a.user_id = u.id
   AND UPPER(TRIM(a.status)) = 'ACTIVE'
  INNER JOIN companies AS c
    ON c.id = a.company_id
   AND UPPER(TRIM(c.status)) IN ('ACTIVE', 'ACTIVO')
  WHERE u.guid = p_user_guid
    AND UPPER(TRIM(u.status)) IN ('ACTIVE', 'ACTIVO')
  ORDER BY c.name, c.code;
END$$

DELIMITER ;
