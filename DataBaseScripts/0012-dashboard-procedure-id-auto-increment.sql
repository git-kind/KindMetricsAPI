-- Apply to KindMetricsData and existing Company databases after 0011.
-- Reconcile databases where dashboard_procedures.id predates the catalog DDL.
ALTER TABLE dashboard_procedures
  MODIFY COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT;
