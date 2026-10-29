-- MySQL 8.4. Apply to one explicitly verified Company database after 0007.
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_dashboard_panel_list$$
CREATE PROCEDURE sp_dashboard_panel_list(
  IN p_dashboard_guid CHAR(36), IN p_tab_guid CHAR(36), IN p_status VARCHAR(20), IN p_type VARCHAR(40), IN p_visible_only TINYINT
)
BEGIN
  SELECT p.*, dp.guid AS dashboard_procedure_guid
  FROM dashboard_panels p
  JOIN dashboard_tabs t ON t.id = p.tab_id
  JOIN dashboards d ON d.id = t.dashboard_id
  LEFT JOIN dashboard_procedures dp ON dp.id = p.dashboard_procedure_id
  WHERE d.guid = p_dashboard_guid AND t.guid = p_tab_guid
    AND (p_status IS NULL OR p.status = p_status)
    AND (p_type IS NULL OR p.panel_type = p_type)
    AND (p_visible_only = 0 OR (p.status = 'ACTIVE' AND p.is_visible = 1 AND t.status = 'ACTIVE' AND d.status = 'ACTIVE'))
  ORDER BY p.grid_y, p.grid_x, p.sort_order, p.id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_panel_get$$
CREATE PROCEDURE sp_dashboard_panel_get(IN p_dashboard_guid CHAR(36), IN p_tab_guid CHAR(36), IN p_panel_guid CHAR(36))
BEGIN
  SELECT p.*, dp.guid AS dashboard_procedure_guid
  FROM dashboard_panels p
  JOIN dashboard_tabs t ON t.id = p.tab_id
  JOIN dashboards d ON d.id = t.dashboard_id
  LEFT JOIN dashboard_procedures dp ON dp.id = p.dashboard_procedure_id
  WHERE d.guid = p_dashboard_guid AND t.guid = p_tab_guid AND p.guid = p_panel_guid
  LIMIT 1;
END$$

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
     OR JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.panelType')) NOT IN ('NUMBER','TABLE','LINE','BAR','PIE','GAUGE','HEATMAP','MAP','TEXT','STAT')
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

DROP PROCEDURE IF EXISTS sp_dashboard_panel_duplicate$$
CREATE PROCEDURE sp_dashboard_panel_duplicate(
  IN p_dashboard_guid CHAR(36), IN p_tab_guid CHAR(36), IN p_panel_guid CHAR(36), IN p_actor BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tab BIGINT UNSIGNED;
  DECLARE v_id BIGINT UNSIGNED;
  DECLARE v_y INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT p.tab_id, p.grid_y INTO v_tab, v_y FROM dashboard_panels p
  JOIN dashboard_tabs t ON t.id = p.tab_id JOIN dashboards d ON d.id = t.dashboard_id
  WHERE d.guid = p_dashboard_guid AND t.guid = p_tab_guid AND p.guid = p_panel_guid FOR UPDATE;
  IF v_tab IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_PANEL_NOT_FOUND'; END IF;
  SELECT COALESCE(MAX(grid_y + grid_h), v_y + 1) INTO v_y FROM dashboard_panels WHERE tab_id = v_tab;
  INSERT INTO dashboard_panels(guid, tab_id, title, description, panel_type, status, grid_x, grid_y, grid_w, grid_h,
    min_w, min_h, max_w, max_h, sort_order, is_collapsed, is_locked, is_visible, is_resizable, is_draggable,
    visualization_config, query_config, display_config, dashboard_procedure_id, procedure_params,
    execution_timeout_seconds, version, created_by)
  SELECT UUID(), tab_id, LEFT(CONCAT(title, ' (copy)'), 200), description, panel_type, 'ACTIVE', grid_x, v_y,
    grid_w, grid_h, min_w, min_h, max_w, max_h, sort_order + 1, is_collapsed, 0, is_visible, is_resizable, is_draggable,
    visualization_config, query_config, display_config, dashboard_procedure_id, procedure_params,
    execution_timeout_seconds, 1, p_actor
  FROM dashboard_panels WHERE guid = p_panel_guid AND tab_id = v_tab;
  SET v_id = LAST_INSERT_ID();
  COMMIT;
  SELECT p.*, dp.guid AS dashboard_procedure_guid FROM dashboard_panels p
  LEFT JOIN dashboard_procedures dp ON dp.id = p.dashboard_procedure_id WHERE p.id = v_id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_panel_move$$
CREATE PROCEDURE sp_dashboard_panel_move(
  IN p_dashboard_guid CHAR(36), IN p_source_tab_guid CHAR(36), IN p_panel_guid CHAR(36),
  IN p_target_tab_guid CHAR(36), IN p_x INT UNSIGNED, IN p_y INT UNSIGNED,
  IN p_expected INT UNSIGNED, IN p_actor BIGINT UNSIGNED
)
BEGIN
  DECLARE v_panel BIGINT UNSIGNED;
  DECLARE v_source BIGINT UNSIGNED;
  DECLARE v_target BIGINT UNSIGNED;
  DECLARE v_version INT UNSIGNED;
  DECLARE v_w INT UNSIGNED;
  DECLARE v_h INT UNSIGNED;
  DECLARE v_locked TINYINT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT t.id INTO v_source FROM dashboard_tabs t JOIN dashboards d ON d.id = t.dashboard_id
  WHERE t.guid = p_source_tab_guid AND d.guid = p_dashboard_guid FOR UPDATE;
  SELECT t.id INTO v_target FROM dashboard_tabs t JOIN dashboards d ON d.id = t.dashboard_id
  WHERE d.guid = p_dashboard_guid AND t.guid = p_target_tab_guid AND t.status = 'ACTIVE' FOR UPDATE;
  SELECT p.id, p.version, p.grid_w, p.grid_h, p.is_locked INTO v_panel, v_version, v_w, v_h, v_locked
  FROM dashboard_panels p WHERE p.guid = p_panel_guid AND p.tab_id = v_source FOR UPDATE;
  IF v_panel IS NULL OR v_target IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_PANEL_MOVE_INVALID'; END IF;
  IF v_version <> p_expected THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_VERSION_CONFLICT'; END IF;
  IF v_locked = 1 OR (SELECT is_draggable FROM dashboard_panels WHERE id = v_panel) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_PANEL_LOCKED';
  END IF;
  IF p_x + v_w > 12 OR EXISTS(SELECT 1 FROM dashboard_panels p WHERE p.tab_id = v_target AND p.id <> v_panel
    AND p_x < p.grid_x + p.grid_w AND p_x + v_w > p.grid_x AND p_y < p.grid_y + p.grid_h AND p_y + v_h > p.grid_y) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_PANEL_OVERLAP';
  END IF;
  UPDATE dashboard_panels SET tab_id = v_target, grid_x = p_x, grid_y = p_y, version = version + 1,
    updated_by = p_actor, updated_at = CURRENT_TIMESTAMP(3) WHERE id = v_panel;
  COMMIT;
  SELECT p.*, dp.guid AS dashboard_procedure_guid FROM dashboard_panels p
  LEFT JOIN dashboard_procedures dp ON dp.id = p.dashboard_procedure_id WHERE p.id = v_panel;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_panel_set_status$$
CREATE PROCEDURE sp_dashboard_panel_set_status(
  IN p_dashboard_guid CHAR(36), IN p_tab_guid CHAR(36), IN p_panel_guid CHAR(36),
  IN p_status VARCHAR(20), IN p_expected INT UNSIGNED, IN p_actor BIGINT UNSIGNED
)
BEGIN
  DECLARE v_id BIGINT UNSIGNED;
  DECLARE v_version INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT p.id, p.version INTO v_id, v_version FROM dashboard_panels p
  JOIN dashboard_tabs t ON t.id = p.tab_id JOIN dashboards d ON d.id = t.dashboard_id
  WHERE d.guid = p_dashboard_guid AND t.guid = p_tab_guid AND p.guid = p_panel_guid FOR UPDATE;
  IF v_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_PANEL_NOT_FOUND'; END IF;
  IF v_version <> p_expected THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_VERSION_CONFLICT'; END IF;
  IF p_status NOT IN ('ACTIVE', 'INACTIVE') THEN SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_PANEL_STATUS'; END IF;
  UPDATE dashboard_panels SET status = p_status, version = version + 1, updated_by = p_actor,
    updated_at = CURRENT_TIMESTAMP(3) WHERE id = v_id;
  COMMIT;
  SELECT p.*, dp.guid AS dashboard_procedure_guid FROM dashboard_panels p
  LEFT JOIN dashboard_procedures dp ON dp.id = p.dashboard_procedure_id WHERE p.id = v_id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_panel_save_layout$$
CREATE PROCEDURE sp_dashboard_panel_save_layout(
  IN p_dashboard_guid CHAR(36), IN p_tab_guid CHAR(36), IN p_layout JSON, IN p_actor BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tab BIGINT UNSIGNED;
  DECLARE v_count INT UNSIGNED;
  DECLARE v_layout_count INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF p_layout IS NULL OR JSON_TYPE(p_layout) <> 'ARRAY' OR p_actor IS NULL THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_PANEL_LAYOUT';
  END IF;
  START TRANSACTION;
  SELECT t.id INTO v_tab FROM dashboard_tabs t JOIN dashboards d ON d.id = t.dashboard_id
  WHERE d.guid = p_dashboard_guid AND t.guid = p_tab_guid FOR UPDATE;
  IF v_tab IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_TAB_NOT_FOUND'; END IF;
  SELECT COUNT(*) INTO v_count FROM dashboard_panels WHERE tab_id = v_tab;
  SET v_layout_count = JSON_LENGTH(p_layout);
  IF v_count <> v_layout_count
     OR (SELECT COUNT(DISTINCT j.guid) FROM JSON_TABLE(p_layout, '$[*]' COLUMNS(guid CHAR(36) PATH '$.guid')) j) <> v_layout_count
     OR (SELECT COUNT(*) FROM JSON_TABLE(p_layout, '$[*]' COLUMNS(
         guid CHAR(36) PATH '$.guid', x INT UNSIGNED PATH '$.gridX', y INT UNSIGNED PATH '$.gridY',
         w INT UNSIGNED PATH '$.gridW', h INT UNSIGNED PATH '$.gridH', version INT UNSIGNED PATH '$.expectedVersion'
       )) j LEFT JOIN dashboard_panels p ON p.guid = j.guid AND p.tab_id = v_tab
       WHERE p.id IS NULL OR p.version <> j.version OR j.w = 0 OR j.h = 0 OR j.x + j.w > 12
         OR j.w < p.min_w OR j.h < p.min_h OR (p.max_w IS NOT NULL AND j.w > p.max_w)
         OR (p.max_h IS NOT NULL AND j.h > p.max_h)
         OR (p.is_locked = 1 AND (j.x <> p.grid_x OR j.y <> p.grid_y OR j.w <> p.grid_w OR j.h <> p.grid_h))
         OR (p.is_draggable = 0 AND (j.x <> p.grid_x OR j.y <> p.grid_y))
         OR (p.is_resizable = 0 AND (j.w <> p.grid_w OR j.h <> p.grid_h))) > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_PANEL_LAYOUT';
  END IF;
  IF EXISTS(SELECT 1 FROM JSON_TABLE(p_layout, '$[*]' COLUMNS(
      guid CHAR(36) PATH '$.guid', x INT UNSIGNED PATH '$.gridX', y INT UNSIGNED PATH '$.gridY',
      w INT UNSIGNED PATH '$.gridW', h INT UNSIGNED PATH '$.gridH'
    )) a JOIN JSON_TABLE(p_layout, '$[*]' COLUMNS(
      guid CHAR(36) PATH '$.guid', x INT UNSIGNED PATH '$.gridX', y INT UNSIGNED PATH '$.gridY',
      w INT UNSIGNED PATH '$.gridW', h INT UNSIGNED PATH '$.gridH'
    )) b ON a.guid < b.guid AND a.x < b.x + b.w AND a.x + a.w > b.x AND a.y < b.y + b.h AND a.y + a.h > b.y) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_PANEL_OVERLAP';
  END IF;
  UPDATE dashboard_panels p JOIN JSON_TABLE(p_layout, '$[*]' COLUMNS(
      guid CHAR(36) PATH '$.guid', x INT UNSIGNED PATH '$.gridX', y INT UNSIGNED PATH '$.gridY',
      w INT UNSIGNED PATH '$.gridW', h INT UNSIGNED PATH '$.gridH'
    )) j ON j.guid = p.guid
  SET p.grid_x = j.x, p.grid_y = j.y, p.grid_w = j.w, p.grid_h = j.h,
      p.version = p.version + 1, p.updated_by = p_actor, p.updated_at = CURRENT_TIMESTAMP(3)
  WHERE p.tab_id = v_tab;
  COMMIT;
  SELECT p.*, dp.guid AS dashboard_procedure_guid FROM dashboard_panels p
  LEFT JOIN dashboard_procedures dp ON dp.id = p.dashboard_procedure_id
  WHERE p.tab_id = v_tab ORDER BY p.grid_y, p.grid_x, p.sort_order;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_panel_execution_get$$
CREATE PROCEDURE sp_dashboard_panel_execution_get(
  IN p_dashboard_guid CHAR(36), IN p_tab_guid CHAR(36), IN p_panel_guid CHAR(36)
)
BEGIN
  SELECT p.guid AS panel_guid, p.panel_type, p.status AS panel_status, p.is_visible,
         d.status AS dashboard_status, t.status AS tab_status,
         dp.guid AS dashboard_procedure_guid, dp.procedure_name, dp.status AS procedure_status,
         dp.parameters_schema, dp.result_schema, p.procedure_params,
         p.execution_timeout_seconds AS panel_timeout_seconds,
         dp.execution_timeout_seconds AS procedure_timeout_seconds
  FROM dashboard_panels p
  JOIN dashboard_tabs t ON t.id = p.tab_id
  JOIN dashboards d ON d.id = t.dashboard_id
  LEFT JOIN dashboard_procedures dp ON dp.id = p.dashboard_procedure_id
  WHERE d.guid = p_dashboard_guid AND t.guid = p_tab_guid AND p.guid = p_panel_guid
  LIMIT 1;
END$$

DELIMITER ;