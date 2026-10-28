-- Apply only to the explicitly selected Company database.
CREATE TABLE IF NOT EXISTS dashboards (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  guid CHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  folder_id BIGINT UNSIGNED NULL,
  tags JSON NOT NULL DEFAULT (JSON_ARRAY()),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  CONSTRAINT chk_dashboards_status CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT chk_dashboards_version CHECK (version >= 1),
  UNIQUE KEY uq_dashboards_guid (guid),
  KEY idx_dashboards_name (name),
  KEY idx_dashboards_folder_id (folder_id),
  KEY idx_dashboards_status (status),
  KEY idx_dashboards_updated_at (updated_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;
