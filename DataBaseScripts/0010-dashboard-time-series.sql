-- MySQL 8.4. Replace the finite panel visualization allowlist with a safe type identifier.
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_dashboard_panel_create$$
CREATE PROCEDURE sp_dashboard_panel_create(
  IN p_dashboard_guid CHAR(36), IN p_tab_guid CHAR(36), IN p_payload JSON, IN p_actor BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tab BIGINT UNSIGNED;
  DECLARE v_id BIGINT UNSIGNED;
  DECLARE v_procedure_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_procedure_guid CHAR(36);
  DECLARE v_panel_type VARCHAR(40);
  DECLARE v_timeout INT UNSIGNED;
  DECLARE v_x INT UNSIGNED; DECLARE v_y INT UNSIGNED; DECLARE v_w INT UNSIGNED; DECLARE v_h INT UNSIGNED;
  DECLARE v_min_w INT UNSIGNED; DECLARE v_min_h INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF p_payload IS NULL OR JSON_TYPE(p_payload) <> 'OBJECT' OR p_actor IS NULL
     OR JSON_TYPE(JSON_EXTRACT(p_payload, '$.title')) <> 'STRING'
     OR CHAR_LENGTH(TRIM(JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.title')))) = 0
     OR CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.title'))) > 200
     OR JSON_TYPE(JSON_EXTRACT(p_payload, '$.panelType')) IS NULL
     OR JSON_TYPE(JSON_EXTRACT(p_payload, '$.panelType')) <> 'STRING'
     OR JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.panelType')) NOT REGEXP '^[A-Z][A-Z0-9_]{0,39}$'
     OR (JSON_CONTAINS_PATH(p_payload, 'one', '$.visualizationConfig') AND JSON_TYPE(JSON_EXTRACT(p_payload, '$.visualizationConfig')) NOT IN ('OBJECT','NULL'))
     OR (JSON_CONTAINS_PATH(p_payload, 'one', '$.queryConfig') AND JSON_TYPE(JSON_EXTRACT(p_payload, '$.queryConfig')) NOT IN ('OBJECT','NULL'))
     OR (JSON_CONTAINS_PATH(p_payload, 'one', '$.displayConfig') AND JSON_TYPE(JSON_EXTRACT(p_payload, '$.displayConfig')) NOT IN ('OBJECT','NULL'))
     OR (JSON_CONTAINS_PATH(p_payload, 'one', '$.procedureParams') AND JSON_TYPE(JSON_EXTRACT(p_payload, '$.procedureParams')) NOT IN ('OBJECT','NULL')) THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_PANEL';
  END IF;
  SET v_panel_type = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.panelType'));
  SET v_procedure_guid = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.dashboardProcedureGuid'));
  SET v_timeout = COALESCE(JSON_VALUE(p_payload, '$.executionTimeoutSeconds' RETURNING UNSIGNED), 30);
  IF v_timeout < 1 OR v_timeout > 300 THEN SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_PANEL_TIMEOUT'; END IF;
  IF v_procedure_guid IS NOT NULL AND v_procedure_guid <> 'null' THEN
    SELECT id INTO v_procedure_id FROM dashboard_procedures WHERE guid = v_procedure_guid AND status = 'ACTIVE';
    IF v_procedure_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_PROCEDURE_NOT_ACTIVE'; END IF;
  END IF;
  IF v_panel_type <> 'TEXT' AND (v_procedure_id IS NULL OR JSON_TYPE(JSON_EXTRACT(p_payload, '$.procedureParams')) <> 'OBJECT'
     OR JSON_VALUE(p_payload, '$.procedureParams.schemaVersion' RETURNING UNSIGNED) <> 1
     OR JSON_TYPE(JSON_EXTRACT(p_payload, '$.procedureParams.parameters')) <> 'ARRAY') THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_PANEL_PROCEDURE';
  END IF;
  SET v_x = COALESCE(JSON_VALUE(p_payload, '$.gridX' RETURNING UNSIGNED), 0);
  SET v_y = COALESCE(JSON_VALUE(p_payload, '$.gridY' RETURNING UNSIGNED), 0);
  SET v_w = COALESCE(JSON_VALUE(p_payload, '$.gridW' RETURNING UNSIGNED), 6);
  SET v_h = COALESCE(JSON_VALUE(p_payload, '$.gridH' RETURNING UNSIGNED), 4);
  SET v_min_w = COALESCE(JSON_VALUE(p_payload, '$.minW' RETURNING UNSIGNED), 2);
  SET v_min_h = COALESCE(JSON_VALUE(p_payload, '$.minH' RETURNING UNSIGNED), 2);
  IF v_w = 0 OR v_h = 0 OR v_x + v_w > 12 OR v_w < v_min_w OR v_h < v_min_h THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_PANEL_GRID';
  END IF;
  START TRANSACTION;
  SELECT t.id INTO v_tab FROM dashboard_tabs t JOIN dashboards d ON d.id = t.dashboard_id
  WHERE d.guid = p_dashboard_guid AND t.guid = p_tab_guid AND t.status = 'ACTIVE' FOR UPDATE;
  IF v_tab IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_TAB_NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM dashboard_panels p WHERE p.tab_id = v_tab AND v_x < p.grid_x + p.grid_w
    AND v_x + v_w > p.grid_x AND v_y < p.grid_y + p.grid_h AND v_y + v_h > p.grid_y) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_PANEL_OVERLAP';
  END IF;
  INSERT INTO dashboard_panels(guid, tab_id, title, description, panel_type, status, grid_x, grid_y, grid_w, grid_h,
    min_w, min_h, max_w, max_h, sort_order, is_collapsed, is_locked, is_visible, is_resizable, is_draggable,
    visualization_config, query_config, display_config, dashboard_procedure_id, procedure_params,
    execution_timeout_seconds, version, created_by)
  VALUES(UUID(), v_tab, JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.title')),
    IF(JSON_TYPE(JSON_EXTRACT(p_payload, '$.description')) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.description'))),
    v_panel_type, 'ACTIVE', v_x, v_y, v_w, v_h, v_min_w, v_min_h,
    JSON_VALUE(p_payload, '$.maxW' RETURNING UNSIGNED), JSON_VALUE(p_payload, '$.maxH' RETURNING UNSIGNED),
    COALESCE(JSON_VALUE(p_payload, '$.sortOrder' RETURNING UNSIGNED), 0),
    COALESCE(JSON_VALUE(p_payload, '$.isCollapsed' RETURNING UNSIGNED), 0),
    COALESCE(JSON_VALUE(p_payload, '$.isLocked' RETURNING UNSIGNED), 0),
    COALESCE(JSON_VALUE(p_payload, '$.isVisible' RETURNING UNSIGNED), 1),
    COALESCE(JSON_VALUE(p_payload, '$.isResizable' RETURNING UNSIGNED), 1),
    COALESCE(JSON_VALUE(p_payload, '$.isDraggable' RETURNING UNSIGNED), 1),
    JSON_EXTRACT(p_payload, '$.visualizationConfig'), JSON_EXTRACT(p_payload, '$.queryConfig'),
    JSON_EXTRACT(p_payload, '$.displayConfig'), v_procedure_id,
    JSON_EXTRACT(p_payload, '$.procedureParams'), v_timeout, 1, p_actor);
  SET v_id = LAST_INSERT_ID();
  COMMIT;
  SELECT p.*, dp.guid AS dashboard_procedure_guid FROM dashboard_panels p
  LEFT JOIN dashboard_procedures dp ON dp.id = p.dashboard_procedure_id WHERE p.id = v_id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_panel_update$$
CREATE PROCEDURE sp_dashboard_panel_update(
  IN p_dashboard_guid CHAR(36), IN p_tab_guid CHAR(36), IN p_panel_guid CHAR(36),
  IN p_payload JSON, IN p_expected INT UNSIGNED, IN p_actor BIGINT UNSIGNED
)
BEGIN
  DECLARE v_id BIGINT UNSIGNED;
  DECLARE v_version INT UNSIGNED;
  DECLARE v_current_type VARCHAR(40);
  DECLARE v_next_type VARCHAR(40);
  DECLARE v_procedure_id BIGINT UNSIGNED;
  DECLARE v_procedure_guid CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF p_payload IS NULL OR JSON_TYPE(p_payload) <> 'OBJECT' OR JSON_LENGTH(p_payload) = 0 THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_PANEL';
  END IF;
  START TRANSACTION;
  SELECT p.id, p.version, p.panel_type, p.dashboard_procedure_id INTO v_id, v_version, v_current_type, v_procedure_id
  FROM dashboard_panels p JOIN dashboard_tabs t ON t.id = p.tab_id JOIN dashboards d ON d.id = t.dashboard_id
  WHERE d.guid = p_dashboard_guid AND t.guid = p_tab_guid AND p.guid = p_panel_guid FOR UPDATE;
  IF v_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_PANEL_NOT_FOUND'; END IF;
  IF v_version <> p_expected THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_VERSION_CONFLICT'; END IF;
  IF JSON_CONTAINS_PATH(p_payload, 'one', '$.gridX') OR JSON_CONTAINS_PATH(p_payload, 'one', '$.gridY')
     OR JSON_CONTAINS_PATH(p_payload, 'one', '$.gridW') OR JSON_CONTAINS_PATH(p_payload, 'one', '$.gridH') THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'LAYOUT_MUST_USE_SAVE_LAYOUT';
  END IF;
  SET v_next_type = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.panelType')), v_current_type);
  IF v_next_type IS NULL OR v_next_type NOT REGEXP '^[A-Z][A-Z0-9_]{0,39}$' THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_PANEL';
  END IF;
  IF JSON_CONTAINS_PATH(p_payload, 'one', '$.dashboardProcedureGuid') THEN
    SET v_procedure_guid = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.dashboardProcedureGuid'));
    IF JSON_TYPE(JSON_EXTRACT(p_payload, '$.dashboardProcedureGuid')) = 'NULL' THEN
      SET v_procedure_id = NULL;
    ELSE
      SELECT id INTO v_procedure_id FROM dashboard_procedures WHERE guid = v_procedure_guid AND status = 'ACTIVE';
      IF v_procedure_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_PROCEDURE_NOT_ACTIVE'; END IF;
    END IF;
  END IF;
  IF v_next_type <> 'TEXT' AND (v_procedure_id IS NULL OR
     (JSON_CONTAINS_PATH(p_payload, 'one', '$.procedureParams') AND JSON_TYPE(JSON_EXTRACT(p_payload, '$.procedureParams')) <> 'OBJECT')) THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_PANEL_PROCEDURE';
  END IF;
  IF JSON_CONTAINS_PATH(p_payload, 'one', '$.executionTimeoutSeconds') AND
     (JSON_VALUE(p_payload, '$.executionTimeoutSeconds' RETURNING UNSIGNED) < 1 OR
      JSON_VALUE(p_payload, '$.executionTimeoutSeconds' RETURNING UNSIGNED) > 300) THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_PANEL_TIMEOUT';
  END IF;
  UPDATE dashboard_panels
  SET title = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.title')), title),
      description = IF(JSON_CONTAINS_PATH(p_payload, 'one', '$.description'),
        IF(JSON_TYPE(JSON_EXTRACT(p_payload, '$.description')) = 'NULL', NULL, JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.description'))), description),
      panel_type = v_next_type,
      visualization_config = IF(JSON_CONTAINS_PATH(p_payload, 'one', '$.visualizationConfig'), JSON_EXTRACT(p_payload, '$.visualizationConfig'), visualization_config),
      query_config = IF(JSON_CONTAINS_PATH(p_payload, 'one', '$.queryConfig'), JSON_EXTRACT(p_payload, '$.queryConfig'), query_config),
      display_config = IF(JSON_CONTAINS_PATH(p_payload, 'one', '$.displayConfig'), JSON_EXTRACT(p_payload, '$.displayConfig'), display_config),
      dashboard_procedure_id = v_procedure_id,
      procedure_params = IF(JSON_CONTAINS_PATH(p_payload, 'one', '$.procedureParams'), JSON_EXTRACT(p_payload, '$.procedureParams'), procedure_params),
      execution_timeout_seconds = COALESCE(JSON_VALUE(p_payload, '$.executionTimeoutSeconds' RETURNING UNSIGNED), execution_timeout_seconds),
      is_collapsed = COALESCE(JSON_VALUE(p_payload, '$.isCollapsed' RETURNING UNSIGNED), is_collapsed),
      is_locked = COALESCE(JSON_VALUE(p_payload, '$.isLocked' RETURNING UNSIGNED), is_locked),
      is_visible = COALESCE(JSON_VALUE(p_payload, '$.isVisible' RETURNING UNSIGNED), is_visible),
      is_resizable = COALESCE(JSON_VALUE(p_payload, '$.isResizable' RETURNING UNSIGNED), is_resizable),
      is_draggable = COALESCE(JSON_VALUE(p_payload, '$.isDraggable' RETURNING UNSIGNED), is_draggable),
      version = version + 1, updated_by = p_actor, updated_at = CURRENT_TIMESTAMP(3)
  WHERE id = v_id;
  COMMIT;
  SELECT p.*, dp.guid AS dashboard_procedure_guid FROM dashboard_panels p
  LEFT JOIN dashboard_procedures dp ON dp.id = p.dashboard_procedure_id WHERE p.id = v_id;
END$$

DELIMITER ;
