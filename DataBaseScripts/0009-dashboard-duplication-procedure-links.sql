-- MySQL 8.4. Apply to one explicitly verified Company database after 0008.
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_dashboard_duplicate$$
CREATE PROCEDURE sp_dashboard_duplicate(
  IN p_guid CHAR(36), IN p_new_name VARCHAR(200), IN p_include_panels TINYINT, IN p_created_by BIGINT UNSIGNED
)
BEGIN
  DECLARE v_source_id BIGINT UNSIGNED;
  DECLARE v_new_id BIGINT UNSIGNED;
  DECLARE v_old_tab_id BIGINT UNSIGNED;
  DECLARE v_new_tab_id BIGINT UNSIGNED;
  DECLARE v_tab_name VARCHAR(150);
  DECLARE v_tab_description TEXT;
  DECLARE v_sort_order INT UNSIGNED;
  DECLARE v_status VARCHAR(20);
  DECLARE v_is_default TINYINT;
  DECLARE v_done TINYINT DEFAULT 0;
  DECLARE tabs_cursor CURSOR FOR
    SELECT id, name, description, sort_order, status, is_default FROM dashboard_tabs
    WHERE dashboard_id = v_source_id ORDER BY sort_order, id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF p_created_by IS NULL OR p_include_panels IS NULL OR p_include_panels NOT IN (0, 1)
     OR (p_new_name IS NOT NULL AND CHAR_LENGTH(TRIM(p_new_name)) = 0) THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_DUPLICATE';
  END IF;
  START TRANSACTION;
  SELECT id INTO v_source_id FROM dashboards WHERE guid = p_guid FOR UPDATE;
  IF v_source_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_NOT_FOUND'; END IF;
  INSERT INTO dashboards(guid, name, description, folder_id, tags, status, refresh_enabled,
    refresh_interval_seconds, version, created_by)
  SELECT UUID(), COALESCE(TRIM(p_new_name), LEFT(CONCAT(name, ' (copy)'), 200)), description,
    folder_id, tags, 'ACTIVE', refresh_enabled, refresh_interval_seconds, 1, p_created_by
  FROM dashboards WHERE id = v_source_id;
  SET v_new_id = LAST_INSERT_ID();
  IF NOT EXISTS (SELECT 1 FROM dashboard_tabs WHERE dashboard_id = v_source_id) THEN
    INSERT INTO dashboard_tabs(guid, dashboard_id, name, description, sort_order, status, is_default, version, created_by)
    VALUES(UUID(), v_new_id, 'General', NULL, 0, 'ACTIVE', 1, 1, p_created_by);
  ELSE
    OPEN tabs_cursor;
    copy_tabs: LOOP
      FETCH tabs_cursor INTO v_old_tab_id, v_tab_name, v_tab_description, v_sort_order, v_status, v_is_default;
      IF v_done = 1 THEN LEAVE copy_tabs; END IF;
      INSERT INTO dashboard_tabs(guid, dashboard_id, name, description, sort_order, status, is_default, version, created_by)
      VALUES(UUID(), v_new_id, v_tab_name, v_tab_description, v_sort_order, v_status, v_is_default, 1, p_created_by);
      SET v_new_tab_id = LAST_INSERT_ID();
      IF p_include_panels = 1 THEN
        INSERT INTO dashboard_panels(guid, tab_id, title, description, panel_type, status, grid_x, grid_y, grid_w, grid_h,
          min_w, min_h, max_w, max_h, sort_order, is_collapsed, is_locked, is_visible, is_resizable, is_draggable,
          visualization_config, query_config, display_config, dashboard_procedure_id, procedure_params,
          execution_timeout_seconds, version, created_by)
        SELECT UUID(), v_new_tab_id, p.title, p.description, p.panel_type, p.status, p.grid_x, p.grid_y, p.grid_w, p.grid_h,
          p.min_w, p.min_h, p.max_w, p.max_h, p.sort_order, p.is_collapsed, p.is_locked, p.is_visible, p.is_resizable, p.is_draggable,
          p.visualization_config, p.query_config, p.display_config, p.dashboard_procedure_id, p.procedure_params,
          p.execution_timeout_seconds, 1, p_created_by
        FROM dashboard_panels p WHERE p.tab_id = v_old_tab_id;
      END IF;
    END LOOP;
    CLOSE tabs_cursor;
  END IF;
  COMMIT;
  SELECT id, guid, name, description, folder_id, tags, status, refresh_enabled, refresh_interval_seconds,
    version, created_at, created_by, updated_at, updated_by FROM dashboards WHERE id = v_new_id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_tab_duplicate$$
CREATE PROCEDURE sp_dashboard_tab_duplicate(
  IN p_dashboard_guid CHAR(36), IN p_tab_guid CHAR(36), IN p_new_name VARCHAR(150),
  IN p_include_panels TINYINT, IN p_actor BIGINT UNSIGNED
)
BEGIN
  DECLARE v_tab BIGINT UNSIGNED;
  DECLARE v_dashboard BIGINT UNSIGNED;
  DECLARE v_new_tab BIGINT UNSIGNED;
  DECLARE v_name VARCHAR(150);
  DECLARE v_description TEXT;
  DECLARE v_order INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT t.id, t.dashboard_id, t.name, t.description, t.sort_order
  INTO v_tab, v_dashboard, v_name, v_description, v_order
  FROM dashboard_tabs t JOIN dashboards d ON d.id = t.dashboard_id
  WHERE d.guid = p_dashboard_guid AND t.guid = p_tab_guid FOR UPDATE;
  IF v_tab IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_TAB_NOT_FOUND'; END IF;
  IF p_include_panels NOT IN (0, 1) OR p_actor IS NULL THEN SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_TAB'; END IF;
  UPDATE dashboard_tabs SET sort_order = sort_order + 1 WHERE dashboard_id = v_dashboard AND sort_order > v_order;
  INSERT INTO dashboard_tabs(guid, dashboard_id, name, description, sort_order, status, is_default, version, created_by)
  VALUES(UUID(), v_dashboard, COALESCE(NULLIF(TRIM(p_new_name), ''), LEFT(CONCAT(v_name, ' (copy)'), 150)),
    v_description, v_order + 1, 'ACTIVE', 0, 1, p_actor);
  SET v_new_tab = LAST_INSERT_ID();
  IF p_include_panels = 1 THEN
    INSERT INTO dashboard_panels(guid, tab_id, title, description, panel_type, status, grid_x, grid_y, grid_w, grid_h,
      min_w, min_h, max_w, max_h, sort_order, is_collapsed, is_locked, is_visible, is_resizable, is_draggable,
      visualization_config, query_config, display_config, dashboard_procedure_id, procedure_params,
      execution_timeout_seconds, version, created_by)
    SELECT UUID(), v_new_tab, title, description, panel_type, status, grid_x, grid_y, grid_w, grid_h,
      min_w, min_h, max_w, max_h, sort_order, is_collapsed, is_locked, is_visible, is_resizable, is_draggable,
      visualization_config, query_config, display_config, dashboard_procedure_id, procedure_params,
      execution_timeout_seconds, 1, p_actor
    FROM dashboard_panels WHERE tab_id = v_tab;
  END IF;
  COMMIT;
  SELECT id, guid, dashboard_id, name, description, sort_order, status, is_default,
    version, created_at, created_by, updated_at, updated_by FROM dashboard_tabs WHERE id = v_new_tab;
END$$

DELIMITER ;