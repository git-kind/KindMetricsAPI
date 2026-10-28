-- Incremental administrative catalog migration.
-- Apply once to the administrative database after reviewing the deployment plan.
ALTER TABLE companies
  ADD COLUMN db_name VARCHAR(128) NULL,
  ADD COLUMN db_username VARCHAR(128) NULL,
  ADD COLUMN db_password_encrypted VARBINARY(512) NULL;
