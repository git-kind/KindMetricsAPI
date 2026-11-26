-- Apply to the central KindMetrics database and existing Company databases after 0012.
-- Preserve existing IDs while restoring the dashboard_tabs generated primary key.
SET @dashboard_tabs_id_is_primary_key = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'dashboard_tabs'
    AND INDEX_NAME = 'PRIMARY'
    AND COLUMN_NAME = 'id'
    AND SEQ_IN_INDEX = 1
);

SET @dashboard_tabs_has_primary_key = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'dashboard_tabs'
    AND CONSTRAINT_TYPE = 'PRIMARY KEY'
);

SET @dashboard_tabs_id_indexed = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'dashboard_tabs'
    AND COLUMN_NAME = 'id'
    AND SEQ_IN_INDEX = 1
);

SET @dashboard_tabs_id_index_ddl = CASE
  WHEN @dashboard_tabs_id_is_primary_key > 0 THEN 'SELECT 1'
  WHEN @dashboard_tabs_has_primary_key = 0 THEN
    'ALTER TABLE dashboard_tabs ADD PRIMARY KEY (id)'
  WHEN @dashboard_tabs_id_indexed = 0 THEN
    'ALTER TABLE dashboard_tabs ADD UNIQUE KEY uq_dashboard_tabs_id (id)'
  ELSE 'SELECT 1'
END;

PREPARE dashboard_tabs_id_index_stmt FROM @dashboard_tabs_id_index_ddl;
EXECUTE dashboard_tabs_id_index_stmt;
DEALLOCATE PREPARE dashboard_tabs_id_index_stmt;

ALTER TABLE dashboard_tabs
  MODIFY COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT;
