-- MySQL 8.4. Apply to one explicitly verified Company database after 0006.
CREATE TABLE IF NOT EXISTS dashboard_procedures (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  guid CHAR(36) NOT NULL,
  procedure_name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  parameters_schema JSON NOT NULL,
  result_schema JSON NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  execution_timeout_seconds INT UNSIGNED NOT NULL DEFAULT 30,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NULL,
  updated_by BIGINT UNSIGNED NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  approval_reference VARCHAR(200) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dashboard_procedures_guid (guid),
  UNIQUE KEY uq_dashboard_procedures_name (procedure_name),
  KEY idx_dashboard_procedures_status (status),
  CONSTRAINT chk_dashboard_procedures_status CHECK (status IN ('PENDING', 'ACTIVE', 'INACTIVE')),
  CONSTRAINT chk_dashboard_procedures_timeout CHECK (execution_timeout_seconds BETWEEN 1 AND 300),
  CONSTRAINT chk_dashboard_procedures_version CHECK (version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @procedure_id_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_panels' AND COLUMN_NAME = 'dashboard_procedure_id'
);
SET @procedure_id_ddl = IF(@procedure_id_exists = 0,
  'ALTER TABLE dashboard_panels ADD COLUMN dashboard_procedure_id BIGINT UNSIGNED NULL', 'SELECT 1');
PREPARE procedure_id_stmt FROM @procedure_id_ddl;
EXECUTE procedure_id_stmt;
DEALLOCATE PREPARE procedure_id_stmt;

SET @procedure_params_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_panels' AND COLUMN_NAME = 'procedure_params'
);
SET @procedure_params_ddl = IF(@procedure_params_exists = 0,
  'ALTER TABLE dashboard_panels ADD COLUMN procedure_params JSON NULL', 'SELECT 1');
PREPARE procedure_params_stmt FROM @procedure_params_ddl;
EXECUTE procedure_params_stmt;
DEALLOCATE PREPARE procedure_params_stmt;

SET @execution_timeout_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_panels' AND COLUMN_NAME = 'execution_timeout_seconds'
);
SET @execution_timeout_ddl = IF(@execution_timeout_exists = 0,
  'ALTER TABLE dashboard_panels ADD COLUMN execution_timeout_seconds INT UNSIGNED NOT NULL DEFAULT 30', 'SELECT 1');
PREPARE execution_timeout_stmt FROM @execution_timeout_ddl;
EXECUTE execution_timeout_stmt;
DEALLOCATE PREPARE execution_timeout_stmt;

SET @procedure_fk_exists = (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dashboard_panels' AND CONSTRAINT_NAME = 'fk_dashboard_panels_procedure'
);
SET @procedure_fk_ddl = IF(@procedure_fk_exists = 0,
  'ALTER TABLE dashboard_panels ADD CONSTRAINT fk_dashboard_panels_procedure FOREIGN KEY (dashboard_procedure_id) REFERENCES dashboard_procedures (id) ON DELETE RESTRICT',
  'SELECT 1');
PREPARE procedure_fk_stmt FROM @procedure_fk_ddl;
EXECUTE procedure_fk_stmt;
DEALLOCATE PREPARE procedure_fk_stmt;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_dashboard_procedure_list$$
CREATE PROCEDURE sp_dashboard_procedure_list(IN p_include_inactive TINYINT)
BEGIN
    SELECT id, guid, procedure_name, description, parameters_schema, result_schema, status,
      execution_timeout_seconds, version, created_at, created_by, updated_at, updated_by, reviewed_by, approval_reference
  FROM dashboard_procedures
  WHERE p_include_inactive = 1 OR status = 'ACTIVE'
  ORDER BY procedure_name, id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_procedure_get$$
CREATE PROCEDURE sp_dashboard_procedure_get(IN p_guid CHAR(36), IN p_include_inactive TINYINT)
BEGIN
    SELECT id, guid, procedure_name, description, parameters_schema, result_schema, status,
      execution_timeout_seconds, version, created_at, created_by, updated_at, updated_by, reviewed_by, approval_reference
  FROM dashboard_procedures
  WHERE guid = p_guid AND (p_include_inactive = 1 OR status = 'ACTIVE')
  LIMIT 1;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_procedure_create$$
CREATE PROCEDURE sp_dashboard_procedure_create(IN p_payload JSON, IN p_actor BIGINT UNSIGNED)
BEGIN
  DECLARE v_name VARCHAR(128);
  DECLARE v_parameter_count INT UNSIGNED;
  DECLARE v_signature_count INT UNSIGNED;
  DECLARE v_total_count INT UNSIGNED;
  DECLARE v_invalid_count INT UNSIGNED;
  DECLARE v_timeout INT UNSIGNED;
  IF p_actor IS NULL OR p_payload IS NULL OR JSON_TYPE(p_payload) <> 'OBJECT'
     OR JSON_TYPE(JSON_EXTRACT(p_payload, '$.procedureName')) <> 'STRING'
     OR JSON_TYPE(JSON_EXTRACT(p_payload, '$.parametersSchema')) <> 'OBJECT'
     OR JSON_TYPE(JSON_EXTRACT(p_payload, '$.resultSchema')) <> 'OBJECT'
     OR JSON_TYPE(JSON_EXTRACT(p_payload, '$.parametersSchema.parameters')) <> 'ARRAY' THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_PROCEDURE';
  END IF;
  SET v_name = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.procedureName'));
  SET v_parameter_count = JSON_LENGTH(JSON_EXTRACT(p_payload, '$.parametersSchema.parameters'));
  SET v_timeout = COALESCE(JSON_VALUE(p_payload, '$.executionTimeoutSeconds' RETURNING UNSIGNED), 30);
  IF v_name NOT REGEXP '^sp_dashboard_[a-z0-9_]{1,112}$' OR v_timeout < 1 OR v_timeout > 300
     OR JSON_LENGTH(JSON_EXTRACT(p_payload, '$.parametersSchema.parameters')) > 64
     OR NOT EXISTS (SELECT 1 FROM information_schema.ROUTINES
                    WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_NAME = v_name AND ROUTINE_TYPE = 'PROCEDURE') THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'DASHBOARD_PROCEDURE_NOT_AUTHORIZABLE';
  END IF;
  SELECT COUNT(*) INTO v_signature_count FROM information_schema.PARAMETERS
  WHERE SPECIFIC_SCHEMA = DATABASE() AND SPECIFIC_NAME = v_name AND PARAMETER_MODE = 'IN';
  SELECT COUNT(*) INTO v_total_count FROM information_schema.PARAMETERS
  WHERE SPECIFIC_SCHEMA = DATABASE() AND SPECIFIC_NAME = v_name;
  SELECT COUNT(*) INTO v_invalid_count
  FROM JSON_TABLE(JSON_EXTRACT(p_payload, '$.parametersSchema'), '$.parameters[*]' COLUMNS(
    ordinal FOR ORDINALITY, parameter_name VARCHAR(64) PATH '$.name', parameter_type VARCHAR(20) PATH '$.type'
  )) expected
  LEFT JOIN information_schema.PARAMETERS actual
    ON actual.SPECIFIC_SCHEMA = DATABASE() AND actual.SPECIFIC_NAME = v_name AND actual.ORDINAL_POSITION = expected.ordinal
  WHERE actual.PARAMETER_NAME IS NULL OR expected.parameter_name <> actual.PARAMETER_NAME
     OR (expected.parameter_type = 'STRING' AND actual.DATA_TYPE NOT IN ('char','varchar','tinytext','text','mediumtext','longtext'))
     OR (expected.parameter_type = 'NUMBER' AND actual.DATA_TYPE NOT IN ('decimal','float','double'))
     OR (expected.parameter_type = 'INTEGER' AND actual.DATA_TYPE NOT IN ('tinyint','smallint','mediumint','int','bigint'))
     OR (expected.parameter_type = 'BOOLEAN' AND actual.DATA_TYPE NOT IN ('tinyint','bit','boolean'))
     OR (expected.parameter_type = 'DATE' AND actual.DATA_TYPE <> 'date')
     OR (expected.parameter_type = 'DATETIME' AND actual.DATA_TYPE NOT IN ('datetime','timestamp'));
  IF v_parameter_count <> v_signature_count OR v_parameter_count <> v_total_count OR v_invalid_count > 0 THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'DASHBOARD_PROCEDURE_SIGNATURE_MISMATCH';
  END IF;
  INSERT INTO dashboard_procedures(guid, procedure_name, description, parameters_schema, result_schema,
    status, execution_timeout_seconds, created_by)
  VALUES(UUID(), v_name, JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.description')),
    JSON_EXTRACT(p_payload, '$.parametersSchema'), JSON_EXTRACT(p_payload, '$.resultSchema'),
    'PENDING', v_timeout, p_actor);
    SELECT id, guid, procedure_name, description, parameters_schema, result_schema, status,
      execution_timeout_seconds, version, created_at, created_by, updated_at, updated_by, reviewed_by, approval_reference
  FROM dashboard_procedures WHERE id = LAST_INSERT_ID();
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_procedure_update$$
CREATE PROCEDURE sp_dashboard_procedure_update(
  IN p_guid CHAR(36), IN p_payload JSON, IN p_expected_version INT UNSIGNED, IN p_actor BIGINT UNSIGNED
)
BEGIN
  DECLARE v_id BIGINT UNSIGNED;
  DECLARE v_created_by BIGINT UNSIGNED;
  DECLARE v_version INT UNSIGNED;
  DECLARE v_status VARCHAR(20);
  DECLARE v_procedure_name VARCHAR(128);
  DECLARE v_parameters_schema JSON;
  DECLARE v_result_schema JSON;
  DECLARE v_next_status VARCHAR(20);
  DECLARE v_contract_changed TINYINT DEFAULT 0;
  DECLARE v_needs_review TINYINT DEFAULT 0;
  DECLARE v_expected_count INT UNSIGNED;
  DECLARE v_input_count INT UNSIGNED;
  DECLARE v_total_count INT UNSIGNED;
  DECLARE v_invalid_count INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF p_actor IS NULL OR p_expected_version IS NULL OR p_payload IS NULL OR JSON_TYPE(p_payload) <> 'OBJECT'
     OR JSON_LENGTH(p_payload) = 0
     OR (JSON_CONTAINS_PATH(p_payload, 'one', '$.procedureName') AND JSON_TYPE(JSON_EXTRACT(p_payload, '$.procedureName')) <> 'STRING')
     OR (JSON_CONTAINS_PATH(p_payload, 'one', '$.parametersSchema') AND JSON_TYPE(JSON_EXTRACT(p_payload, '$.parametersSchema')) <> 'OBJECT')
     OR (JSON_CONTAINS_PATH(p_payload, 'one', '$.resultSchema') AND JSON_TYPE(JSON_EXTRACT(p_payload, '$.resultSchema')) <> 'OBJECT')
     OR (JSON_CONTAINS_PATH(p_payload, 'one', '$.executionTimeoutSeconds') AND
         (JSON_TYPE(JSON_EXTRACT(p_payload, '$.executionTimeoutSeconds')) <> 'INTEGER'
          OR CAST(JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.executionTimeoutSeconds')) AS UNSIGNED) < 1
          OR CAST(JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.executionTimeoutSeconds')) AS UNSIGNED) > 300))
     OR (JSON_CONTAINS_PATH(p_payload, 'one', '$.status') AND JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.status')) NOT IN ('ACTIVE', 'INACTIVE')) THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_PROCEDURE';
  END IF;
  START TRANSACTION;
  SELECT id, created_by, version, status, procedure_name, parameters_schema, result_schema
  INTO v_id, v_created_by, v_version, v_status, v_procedure_name, v_parameters_schema, v_result_schema
  FROM dashboard_procedures WHERE guid = p_guid FOR UPDATE;
  IF v_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_PROCEDURE_NOT_FOUND'; END IF;
  IF v_version <> p_expected_version THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_VERSION_CONFLICT'; END IF;
  SET v_contract_changed = JSON_CONTAINS_PATH(p_payload, 'one', '$.procedureName')
    OR JSON_CONTAINS_PATH(p_payload, 'one', '$.parametersSchema')
    OR JSON_CONTAINS_PATH(p_payload, 'one', '$.resultSchema');
  SET v_procedure_name = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.procedureName')), v_procedure_name);
  SET v_parameters_schema = IF(JSON_CONTAINS_PATH(p_payload, 'one', '$.parametersSchema'),
    JSON_EXTRACT(p_payload, '$.parametersSchema'), v_parameters_schema);
  SET v_result_schema = IF(JSON_CONTAINS_PATH(p_payload, 'one', '$.resultSchema'),
    JSON_EXTRACT(p_payload, '$.resultSchema'), v_result_schema);
  SET v_next_status = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.status')), v_status);
  IF v_contract_changed = 1 AND NOT JSON_CONTAINS_PATH(p_payload, 'one', '$.status') THEN
    SET v_next_status = 'PENDING';
  END IF;
  SET v_needs_review = v_next_status = 'ACTIVE' AND (v_status <> 'ACTIVE' OR v_contract_changed = 1);
  IF v_procedure_name NOT REGEXP '^sp_dashboard_[a-z0-9_]{1,112}$'
     OR JSON_TYPE(JSON_EXTRACT(v_parameters_schema, '$.parameters')) <> 'ARRAY'
     OR NOT EXISTS (SELECT 1 FROM information_schema.ROUTINES
                    WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_NAME = v_procedure_name AND ROUTINE_TYPE = 'PROCEDURE') THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'DASHBOARD_PROCEDURE_NOT_AUTHORIZABLE';
  END IF;
  SET v_expected_count = JSON_LENGTH(JSON_EXTRACT(v_parameters_schema, '$.parameters'));
  SELECT COUNT(*) INTO v_input_count FROM information_schema.PARAMETERS
  WHERE SPECIFIC_SCHEMA = DATABASE() AND SPECIFIC_NAME = v_procedure_name AND PARAMETER_MODE = 'IN';
  SELECT COUNT(*) INTO v_total_count FROM information_schema.PARAMETERS
  WHERE SPECIFIC_SCHEMA = DATABASE() AND SPECIFIC_NAME = v_procedure_name;
  SELECT COUNT(*) INTO v_invalid_count
  FROM JSON_TABLE(v_parameters_schema, '$.parameters[*]' COLUMNS(
    ordinal FOR ORDINALITY, parameter_name VARCHAR(64) PATH '$.name', parameter_type VARCHAR(20) PATH '$.type'
  )) expected
  LEFT JOIN information_schema.PARAMETERS actual
    ON actual.SPECIFIC_SCHEMA = DATABASE() AND actual.SPECIFIC_NAME = v_procedure_name AND actual.ORDINAL_POSITION = expected.ordinal
  WHERE actual.PARAMETER_NAME IS NULL OR expected.parameter_name <> actual.PARAMETER_NAME
     OR (expected.parameter_type = 'STRING' AND actual.DATA_TYPE NOT IN ('char','varchar','tinytext','text','mediumtext','longtext'))
     OR (expected.parameter_type = 'NUMBER' AND actual.DATA_TYPE NOT IN ('decimal','float','double'))
     OR (expected.parameter_type = 'INTEGER' AND actual.DATA_TYPE NOT IN ('tinyint','smallint','mediumint','int','bigint'))
     OR (expected.parameter_type = 'BOOLEAN' AND actual.DATA_TYPE NOT IN ('tinyint','bit','boolean'))
     OR (expected.parameter_type = 'DATE' AND actual.DATA_TYPE <> 'date')
     OR (expected.parameter_type = 'DATETIME' AND actual.DATA_TYPE NOT IN ('datetime','timestamp'));
  IF v_expected_count <> v_input_count OR v_expected_count <> v_total_count OR v_invalid_count > 0 THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'DASHBOARD_PROCEDURE_SIGNATURE_MISMATCH';
  END IF;
  IF v_needs_review = 1 THEN
    IF p_actor = v_created_by OR JSON_TYPE(JSON_EXTRACT(p_payload, '$.approvalReference')) <> 'STRING'
       OR CHAR_LENGTH(TRIM(JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.approvalReference')))) = 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_PROCEDURE_REVIEW_REQUIRED';
    END IF;
    UPDATE dashboard_procedures SET reviewed_by = p_actor,
      approval_reference = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.approvalReference')) WHERE id = v_id;
  END IF;
  UPDATE dashboard_procedures
  SET procedure_name = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.procedureName')), procedure_name),
      description = IF(JSON_CONTAINS_PATH(p_payload, 'one', '$.description'),
        IF(JSON_TYPE(JSON_EXTRACT(p_payload, '$.description')) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.description'))), description),
      parameters_schema = IF(JSON_CONTAINS_PATH(p_payload, 'one', '$.parametersSchema'), JSON_EXTRACT(p_payload, '$.parametersSchema'), parameters_schema),
      result_schema = IF(JSON_CONTAINS_PATH(p_payload, 'one', '$.resultSchema'), JSON_EXTRACT(p_payload, '$.resultSchema'), result_schema),
      status = v_next_status,
      execution_timeout_seconds = COALESCE(JSON_VALUE(p_payload, '$.executionTimeoutSeconds' RETURNING UNSIGNED), execution_timeout_seconds),
      reviewed_by = IF(v_contract_changed = 1 AND v_next_status <> 'ACTIVE', NULL, reviewed_by),
      approval_reference = IF(v_contract_changed = 1 AND v_next_status <> 'ACTIVE', NULL, approval_reference),
      version = version + 1, updated_by = p_actor, updated_at = CURRENT_TIMESTAMP(3)
  WHERE id = v_id;
  COMMIT;
    SELECT id, guid, procedure_name, description, parameters_schema, result_schema, status,
      execution_timeout_seconds, version, created_at, created_by, updated_at, updated_by, reviewed_by, approval_reference
  FROM dashboard_procedures WHERE id = v_id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_procedure_delete$$
CREATE PROCEDURE sp_dashboard_procedure_delete(IN p_guid CHAR(36))
BEGIN
  DECLARE v_id BIGINT UNSIGNED;
  SELECT id INTO v_id FROM dashboard_procedures WHERE guid = p_guid;
  IF v_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_PROCEDURE_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM dashboard_panels WHERE dashboard_procedure_id = v_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_PROCEDURE_IN_USE';
  END IF;
  DELETE FROM dashboard_procedures WHERE id = v_id;
  SELECT 1 AS deleted;
END$$

DELIMITER ;