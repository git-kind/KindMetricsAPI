-- RBAC roles and initial users.
-- Run in the central KindMetrics_Erick database after the users, companies,
-- and user_company_access schema scripts.
-- Existing password hashes are never changed by the seed statements.
-- Legacy perfil='Visor' is the same read-only role and is migrated to 'Viewer'.

SET @users_profile_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'perfil'
);

SET @users_profile_sql = IF(
  @users_profile_exists = 0,
  'ALTER TABLE users ADD COLUMN perfil varchar(20) NOT NULL DEFAULT ''Viewer''',
  'ALTER TABLE users MODIFY COLUMN perfil varchar(20) NOT NULL DEFAULT ''Viewer'''
);
PREPARE users_profile_stmt FROM @users_profile_sql;
EXECUTE users_profile_stmt;
DEALLOCATE PREPARE users_profile_stmt;

UPDATE users
SET perfil = 'Viewer'
WHERE UPPER(TRIM(perfil)) = 'VISOR';

-- This project stores its account role in users.perfil; no duplicate role
-- column is introduced. Inserts are idempotent and preserve existing hashes.
INSERT INTO users (
  guid, email, name, password_hash, status, is_platform_admin, perfil
)
VALUES (
  UUID(),
  'erick.planes@gmail.com',
  'Erick Planes',
  '$argon2id$v=19$m=65536,t=3,p=4$8PnYCaQyjqITkSm70uuETg$phHtYkO2n8RkxU44yPzM7WISjn+pOnN3Xc/XM2bLvq0',
  'ACTIVE',
  1,
  'Admin'
)
ON DUPLICATE KEY UPDATE
  is_platform_admin = VALUES(is_platform_admin),
  perfil = VALUES(perfil);

INSERT INTO users (
  guid, email, name, password_hash, status, is_platform_admin, perfil
)
VALUES (
  UUID(),
  'planes.erich@gmail.com',
  'Erich Planes',
  '$argon2id$v=19$m=65536,t=3,p=4$kr11GW8gslzr/r0SV6XCiA$z4RfF5p3B8UmLLHIOq2PQvUWTeDRGLhKbTG4jtkNBTA',
  'ACTIVE',
  0,
  'Editor'
)
ON DUPLICATE KEY UPDATE
  is_platform_admin = VALUES(is_platform_admin),
  perfil = VALUES(perfil);

-- The Editor may work in each currently active tenant. No access is granted
-- to future companies automatically.
INSERT INTO user_company_access (user_id, company_id, status)
SELECT u.id, c.id, 'ACTIVE'
FROM users AS u
JOIN companies AS c
  ON UPPER(TRIM(c.status)) = 'ACTIVE'
WHERE LOWER(u.email) = 'planes.erich@gmail.com'
ON DUPLICATE KEY UPDATE status = 'ACTIVE';

INSERT INTO users (
  guid, email, name, password_hash, status, is_platform_admin, perfil
)
VALUES (
  UUID(),
  'alienware0118@outlook.com',
  'Alienware Viewer',
  '$argon2id$v=19$m=65536,t=3,p=4$gkmsp9DdvpC0ChvXxOTBjQ$+GE6nMOy1YFZ9Ab1pjlg0JeP6qm6Agnuz85gAcraCgM',
  'ACTIVE',
  0,
  'Viewer'
)
ON DUPLICATE KEY UPDATE
  is_platform_admin = VALUES(is_platform_admin),
  perfil = VALUES(perfil);

-- Viewers can select existing active companies to view their dashboards.
INSERT INTO user_company_access (user_id, company_id, status)
SELECT u.id, c.id, 'ACTIVE'
FROM users AS u
JOIN companies AS c
  ON UPPER(TRIM(c.status)) = 'ACTIVE'
WHERE LOWER(u.email) = 'alienware0118@outlook.com'
ON DUPLICATE KEY UPDATE status = 'ACTIVE';

SELECT email, perfil AS role, status, is_platform_admin
FROM users
WHERE LOWER(email) IN (
  'erick.planes@gmail.com',
  'planes.erich@gmail.com',
  'alienware0118@outlook.com'
)
ORDER BY email;
