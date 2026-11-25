-- Allow dashboard procedure and panel execution timeouts up to 25 minutes.
-- Run after 0007 and 0008 have been updated/reapplied.

SET @timeout_constraint_exists = (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'dashboard_procedures'
    AND constraint_name = 'chk_dashboard_procedures_timeout'
);

SET @drop_timeout_constraint_sql = IF(
  @timeout_constraint_exists > 0,
  'ALTER TABLE dashboard_procedures DROP CHECK chk_dashboard_procedures_timeout',
  'SELECT 1'
);
PREPARE drop_timeout_constraint_stmt FROM @drop_timeout_constraint_sql;
EXECUTE drop_timeout_constraint_stmt;
DEALLOCATE PREPARE drop_timeout_constraint_stmt;

ALTER TABLE dashboard_procedures
  ADD CONSTRAINT chk_dashboard_procedures_timeout
  CHECK (execution_timeout_seconds BETWEEN 1 AND 1500);
