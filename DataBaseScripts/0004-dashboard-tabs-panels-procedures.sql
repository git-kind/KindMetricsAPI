-- MySQL 8.4. Apply after 0003-dashboard-tabs-panels-schema.sql.
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_dashboard_tab_list$$
CREATE PROCEDURE sp_dashboard_tab_list(IN p_dashboard_guid CHAR(36), IN p_status VARCHAR(20))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dashboards WHERE guid = p_dashboard_guid) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_NOT_FOUND';
  END IF;
  SELECT t.id, t.guid, t.dashboard_id, t.name, t.description, t.sort_order, t.status,
         t.is_default, t.version, t.created_at, t.created_by, t.updated_at, t.updated_by,
         (SELECT COUNT(*) FROM dashboard_panels p WHERE p.tab_id=t.id) AS panel_count
  FROM dashboard_tabs t JOIN dashboards d ON d.id=t.dashboard_id
  WHERE d.guid=p_dashboard_guid AND (p_status IS NULL OR t.status=p_status)
  ORDER BY t.sort_order, t.id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_tab_get$$
CREATE PROCEDURE sp_dashboard_tab_get(IN p_dashboard_guid CHAR(36), IN p_tab_guid CHAR(36))
BEGIN
  SELECT t.id,t.guid,t.dashboard_id,t.name,t.description,t.sort_order,t.status,t.is_default,
         t.version,t.created_at,t.created_by,t.updated_at,t.updated_by
  FROM dashboard_tabs t JOIN dashboards d ON d.id=t.dashboard_id
  WHERE d.guid=p_dashboard_guid AND t.guid=p_tab_guid LIMIT 1;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_tab_create$$
CREATE PROCEDURE sp_dashboard_tab_create(IN p_dashboard_guid CHAR(36), IN p_name VARCHAR(150),
  IN p_description TEXT, IN p_actor BIGINT UNSIGNED)
BEGIN
  DECLARE v_dashboard BIGINT UNSIGNED;
  DECLARE v_id BIGINT UNSIGNED;
  DECLARE v_order INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF p_name IS NULL OR CHAR_LENGTH(TRIM(p_name))=0 OR CHAR_LENGTH(p_name)>150 OR p_actor IS NULL THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT='INVALID_DASHBOARD_TAB';
  END IF;
  START TRANSACTION;
  SELECT id INTO v_dashboard FROM dashboards WHERE guid=p_dashboard_guid FOR UPDATE;
  IF v_dashboard IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_NOT_FOUND'; END IF;
  SELECT COALESCE(MAX(sort_order)+1,0) INTO v_order FROM dashboard_tabs WHERE dashboard_id=v_dashboard;
  INSERT INTO dashboard_tabs(guid,dashboard_id,name,description,sort_order,status,is_default,version,created_by)
  VALUES(UUID(),v_dashboard,TRIM(p_name),p_description,v_order,'ACTIVE',0,1,p_actor);
  SET v_id=LAST_INSERT_ID();
  COMMIT;
  SELECT id,guid,dashboard_id,name,description,sort_order,status,is_default,version,created_at,created_by,updated_at,updated_by
  FROM dashboard_tabs WHERE id=v_id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_tab_update$$
CREATE PROCEDURE sp_dashboard_tab_update(IN p_dashboard_guid CHAR(36), IN p_tab_guid CHAR(36),
  IN p_properties JSON, IN p_expected INT UNSIGNED, IN p_actor BIGINT UNSIGNED)
BEGIN
  DECLARE v_id BIGINT UNSIGNED;
  DECLARE v_version INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF p_properties IS NULL OR JSON_TYPE(p_properties)<>'OBJECT' OR JSON_LENGTH(p_properties)=0
    OR p_expected IS NULL OR p_actor IS NULL
    OR (JSON_CONTAINS_PATH(p_properties,'one','$.name') AND
      (JSON_TYPE(JSON_EXTRACT(p_properties,'$.name'))<>'STRING' OR
       CHAR_LENGTH(TRIM(JSON_UNQUOTE(JSON_EXTRACT(p_properties,'$.name'))))=0 OR
       CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(p_properties,'$.name')))>150))
    OR (JSON_CONTAINS_PATH(p_properties,'one','$.description') AND
       JSON_TYPE(JSON_EXTRACT(p_properties,'$.description')) NOT IN ('STRING','NULL')) THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT='INVALID_DASHBOARD_TAB';
  END IF;
  START TRANSACTION;
  SELECT t.id,t.version INTO v_id,v_version FROM dashboard_tabs t
    JOIN dashboards d ON d.id=t.dashboard_id
    WHERE d.guid=p_dashboard_guid AND t.guid=p_tab_guid FOR UPDATE;
  IF v_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_TAB_NOT_FOUND'; END IF;
  IF v_version<>p_expected THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_VERSION_CONFLICT'; END IF;
  UPDATE dashboard_tabs SET
    name=IF(JSON_CONTAINS_PATH(p_properties,'one','$.name'),JSON_UNQUOTE(JSON_EXTRACT(p_properties,'$.name')),name),
    description=IF(JSON_CONTAINS_PATH(p_properties,'one','$.description'),
      IF(JSON_TYPE(JSON_EXTRACT(p_properties,'$.description'))='NULL',NULL,JSON_UNQUOTE(JSON_EXTRACT(p_properties,'$.description'))),description),
    version=version+1,updated_by=p_actor,updated_at=CURRENT_TIMESTAMP(3) WHERE id=v_id;
  COMMIT;
  SELECT id,guid,dashboard_id,name,description,sort_order,status,is_default,version,created_at,created_by,updated_at,updated_by FROM dashboard_tabs WHERE id=v_id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_tab_duplicate$$
CREATE PROCEDURE sp_dashboard_tab_duplicate(IN p_dashboard_guid CHAR(36),IN p_tab_guid CHAR(36),
  IN p_new_name VARCHAR(150),IN p_include_panels TINYINT,IN p_actor BIGINT UNSIGNED)
BEGIN
  DECLARE v_tab BIGINT UNSIGNED;
  DECLARE v_dashboard BIGINT UNSIGNED;
  DECLARE v_new_tab BIGINT UNSIGNED;
  DECLARE v_name VARCHAR(150);
  DECLARE v_description TEXT;
  DECLARE v_order INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT t.id,t.dashboard_id,t.name,t.description,t.sort_order INTO v_tab,v_dashboard,v_name,v_description,v_order
    FROM dashboard_tabs t JOIN dashboards d ON d.id=t.dashboard_id
    WHERE d.guid=p_dashboard_guid AND t.guid=p_tab_guid FOR UPDATE;
  IF v_tab IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_TAB_NOT_FOUND'; END IF;
  IF p_include_panels NOT IN (0,1) OR p_actor IS NULL THEN SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT='INVALID_DASHBOARD_TAB'; END IF;
  UPDATE dashboard_tabs SET sort_order=sort_order+1 WHERE dashboard_id=v_dashboard AND sort_order>v_order;
  INSERT INTO dashboard_tabs(guid,dashboard_id,name,description,sort_order,status,is_default,version,created_by)
    VALUES(UUID(),v_dashboard,COALESCE(NULLIF(TRIM(p_new_name),''),LEFT(CONCAT(v_name,' (copy)'),150)),v_description,v_order+1,'ACTIVE',0,1,p_actor);
  SET v_new_tab=LAST_INSERT_ID();
  IF p_include_panels=1 THEN
    INSERT INTO dashboard_panels(guid,tab_id,title,description,panel_type,status,grid_x,grid_y,grid_w,grid_h,min_w,min_h,max_w,max_h,sort_order,is_collapsed,is_locked,is_visible,is_resizable,is_draggable,visualization_config,query_config,display_config,version,created_by)
    SELECT UUID(),v_new_tab,title,description,panel_type,status,grid_x,grid_y,grid_w,grid_h,min_w,min_h,max_w,max_h,sort_order,is_collapsed,is_locked,is_visible,is_resizable,is_draggable,visualization_config,query_config,display_config,1,p_actor
    FROM dashboard_panels WHERE tab_id=v_tab;
  END IF;
  COMMIT;
  SELECT id,guid,dashboard_id,name,description,sort_order,status,is_default,version,created_at,created_by,updated_at,updated_by FROM dashboard_tabs WHERE id=v_new_tab;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_tab_reorder$$
CREATE PROCEDURE sp_dashboard_tab_reorder(IN p_dashboard_guid CHAR(36),IN p_order JSON,IN p_actor BIGINT UNSIGNED)
BEGIN
  DECLARE v_dashboard BIGINT UNSIGNED;
  DECLARE v_count INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF p_order IS NULL OR JSON_TYPE(p_order)<>'ARRAY' OR p_actor IS NULL THEN SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT='INVALID_DASHBOARD_TAB_ORDER'; END IF;
  START TRANSACTION;
  SELECT id INTO v_dashboard FROM dashboards WHERE guid=p_dashboard_guid FOR UPDATE;
  IF v_dashboard IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_NOT_FOUND'; END IF;
  SELECT COUNT(*) INTO v_count FROM dashboard_tabs WHERE dashboard_id=v_dashboard;
  IF JSON_LENGTH(p_order)<>v_count OR
    (SELECT COUNT(DISTINCT j.guid) FROM JSON_TABLE(p_order,'$[*]' COLUMNS(guid CHAR(36) PATH '$.guid',sort_order INT UNSIGNED PATH '$.sortOrder')) j)<>v_count OR
    (SELECT COUNT(DISTINCT j.sort_order) FROM JSON_TABLE(p_order,'$[*]' COLUMNS(guid CHAR(36) PATH '$.guid',sort_order INT UNSIGNED PATH '$.sortOrder')) j)<>v_count OR
    (SELECT COUNT(*) FROM JSON_TABLE(p_order,'$[*]' COLUMNS(guid CHAR(36) PATH '$.guid',sort_order INT UNSIGNED PATH '$.sortOrder')) j
      LEFT JOIN dashboard_tabs t ON t.guid=j.guid AND t.dashboard_id=v_dashboard WHERE t.id IS NULL)<>0 THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT='INVALID_DASHBOARD_TAB_ORDER';
  END IF;
  UPDATE dashboard_tabs t JOIN JSON_TABLE(p_order,'$[*]' COLUMNS(guid CHAR(36) PATH '$.guid',sort_order INT UNSIGNED PATH '$.sortOrder')) j
    ON j.guid=t.guid SET t.sort_order=j.sort_order,t.version=t.version+1,t.updated_by=p_actor,t.updated_at=CURRENT_TIMESTAMP(3)
    WHERE t.dashboard_id=v_dashboard;
  COMMIT;
  SELECT t.id,t.guid,t.dashboard_id,t.name,t.description,t.sort_order,t.status,t.is_default,t.version,t.created_at,t.created_by,t.updated_at,t.updated_by
  FROM dashboard_tabs t WHERE t.dashboard_id=v_dashboard ORDER BY t.sort_order,t.id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_tab_set_default$$
CREATE PROCEDURE sp_dashboard_tab_set_default(IN p_dashboard_guid CHAR(36),IN p_tab_guid CHAR(36),IN p_actor BIGINT UNSIGNED)
BEGIN
  DECLARE v_dashboard BIGINT UNSIGNED;
  DECLARE v_tab BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_dashboard FROM dashboards WHERE guid=p_dashboard_guid FOR UPDATE;
  SELECT t.id INTO v_tab FROM dashboard_tabs t WHERE t.guid=p_tab_guid AND t.dashboard_id=v_dashboard AND t.status='ACTIVE' FOR UPDATE;
  IF v_dashboard IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_NOT_FOUND'; END IF;
  IF v_tab IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ACTIVE_DASHBOARD_TAB_REQUIRED'; END IF;
  UPDATE dashboard_tabs SET is_default=0,version=version+1,updated_by=p_actor,updated_at=CURRENT_TIMESTAMP(3) WHERE dashboard_id=v_dashboard AND is_default=1;
  UPDATE dashboard_tabs SET is_default=1,version=version+1,updated_by=p_actor,updated_at=CURRENT_TIMESTAMP(3) WHERE id=v_tab;
  COMMIT;
  SELECT id,guid,dashboard_id,name,description,sort_order,status,is_default,version,created_at,created_by,updated_at,updated_by FROM dashboard_tabs WHERE id=v_tab;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_tab_set_status$$
CREATE PROCEDURE sp_dashboard_tab_set_status(IN p_dashboard_guid CHAR(36),IN p_tab_guid CHAR(36),IN p_status VARCHAR(20),IN p_expected INT UNSIGNED,IN p_actor BIGINT UNSIGNED)
BEGIN
  DECLARE v_dashboard BIGINT UNSIGNED;
  DECLARE v_tab BIGINT UNSIGNED;
  DECLARE v_version INT UNSIGNED;
  DECLARE v_default TINYINT;
  DECLARE v_active INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_dashboard FROM dashboards WHERE guid=p_dashboard_guid FOR UPDATE;
  SELECT id,version,is_default INTO v_tab,v_version,v_default FROM dashboard_tabs WHERE guid=p_tab_guid AND dashboard_id=v_dashboard FOR UPDATE;
  IF v_tab IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_TAB_NOT_FOUND'; END IF;
  IF v_version<>p_expected THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_VERSION_CONFLICT'; END IF;
  IF p_status NOT IN ('ACTIVE','INACTIVE') THEN SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT='INVALID_DASHBOARD_TAB_STATUS'; END IF;
  IF p_status='INACTIVE' THEN
    SELECT COUNT(*) INTO v_active FROM dashboard_tabs WHERE dashboard_id=v_dashboard AND status='ACTIVE' AND id<>v_tab;
    IF v_active=0 OR v_default=1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_TAB_DEFAULT_OR_LAST_ACTIVE'; END IF;
  END IF;
  UPDATE dashboard_tabs SET status=p_status,version=version+1,updated_by=p_actor,updated_at=CURRENT_TIMESTAMP(3) WHERE id=v_tab;
  COMMIT;
  SELECT id,guid,dashboard_id,name,description,sort_order,status,is_default,version,created_at,created_by,updated_at,updated_by FROM dashboard_tabs WHERE id=v_tab;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_tab_delete$$
CREATE PROCEDURE sp_dashboard_tab_delete(IN p_dashboard_guid CHAR(36),IN p_tab_guid CHAR(36))
BEGIN
  DECLARE v_dashboard BIGINT UNSIGNED;
  DECLARE v_tab BIGINT UNSIGNED;
  DECLARE v_default TINYINT;
  DECLARE v_count INT UNSIGNED;
  DECLARE v_panels INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_dashboard FROM dashboards WHERE guid=p_dashboard_guid FOR UPDATE;
  SELECT id,is_default INTO v_tab,v_default FROM dashboard_tabs WHERE guid=p_tab_guid AND dashboard_id=v_dashboard FOR UPDATE;
  IF v_tab IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_TAB_NOT_FOUND'; END IF;
  SELECT COUNT(*) INTO v_count FROM dashboard_tabs WHERE dashboard_id=v_dashboard;
  SELECT COUNT(*) INTO v_panels FROM dashboard_panels WHERE tab_id=v_tab;
  IF v_count<=1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_TAB_LAST'; END IF;
  IF v_default=1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_TAB_DEFAULT'; END IF;
  IF v_panels>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_TAB_HAS_PANELS'; END IF;
  DELETE FROM dashboard_tabs WHERE id=v_tab;
  COMMIT;
  SELECT 1 AS deleted;
END$$

-- Panel procedures
DROP PROCEDURE IF EXISTS sp_dashboard_panel_list$$
CREATE PROCEDURE sp_dashboard_panel_list(IN p_dashboard_guid CHAR(36),IN p_tab_guid CHAR(36),IN p_status VARCHAR(20),IN p_type VARCHAR(40),IN p_visible_only TINYINT)
BEGIN
  SELECT p.* FROM dashboard_panels p JOIN dashboard_tabs t ON t.id=p.tab_id JOIN dashboards d ON d.id=t.dashboard_id
  WHERE d.guid=p_dashboard_guid AND t.guid=p_tab_guid AND (p_status IS NULL OR p.status=p_status)
    AND (p_type IS NULL OR p.panel_type=p_type) AND (p_visible_only=0 OR (p.status='ACTIVE' AND p.is_visible=1 AND t.status='ACTIVE'))
  ORDER BY p.grid_y,p.grid_x,p.sort_order,p.id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_panel_get$$
CREATE PROCEDURE sp_dashboard_panel_get(IN p_dashboard_guid CHAR(36),IN p_tab_guid CHAR(36),IN p_panel_guid CHAR(36))
BEGIN
  SELECT p.* FROM dashboard_panels p JOIN dashboard_tabs t ON t.id=p.tab_id JOIN dashboards d ON d.id=t.dashboard_id
  WHERE d.guid=p_dashboard_guid AND t.guid=p_tab_guid AND p.guid=p_panel_guid LIMIT 1;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_panel_create$$
CREATE PROCEDURE sp_dashboard_panel_create(IN p_dashboard_guid CHAR(36),IN p_tab_guid CHAR(36),IN p_payload JSON,IN p_actor BIGINT UNSIGNED)
BEGIN
  DECLARE v_tab BIGINT UNSIGNED;
  DECLARE v_id BIGINT UNSIGNED;
  DECLARE v_x INT UNSIGNED; DECLARE v_y INT UNSIGNED; DECLARE v_w INT UNSIGNED; DECLARE v_h INT UNSIGNED;
  DECLARE v_min_w INT UNSIGNED; DECLARE v_min_h INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF p_payload IS NULL OR JSON_TYPE(p_payload)<>'OBJECT' OR p_actor IS NULL
     OR JSON_TYPE(JSON_EXTRACT(p_payload,'$.title'))<>'STRING'
     OR CHAR_LENGTH(TRIM(JSON_UNQUOTE(JSON_EXTRACT(p_payload,'$.title'))))=0
     OR CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(p_payload,'$.title')))>200
     OR JSON_UNQUOTE(JSON_EXTRACT(p_payload,'$.panelType')) NOT IN ('LINE','BAR','PIE','GAUGE','STAT','TABLE','HEATMAP','TEXT')
     OR (JSON_CONTAINS_PATH(p_payload,'one','$.visualizationConfig') AND JSON_TYPE(JSON_EXTRACT(p_payload,'$.visualizationConfig')) NOT IN ('OBJECT','NULL'))
     OR (JSON_CONTAINS_PATH(p_payload,'one','$.queryConfig') AND JSON_TYPE(JSON_EXTRACT(p_payload,'$.queryConfig')) NOT IN ('OBJECT','NULL'))
     OR (JSON_CONTAINS_PATH(p_payload,'one','$.displayConfig') AND JSON_TYPE(JSON_EXTRACT(p_payload,'$.displayConfig')) NOT IN ('OBJECT','NULL')) THEN SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT='INVALID_DASHBOARD_PANEL'; END IF;
  SET v_x=COALESCE(JSON_VALUE(p_payload,'$.gridX' RETURNING UNSIGNED),0);
  SET v_y=COALESCE(JSON_VALUE(p_payload,'$.gridY' RETURNING UNSIGNED),0);
  SET v_w=COALESCE(JSON_VALUE(p_payload,'$.gridW' RETURNING UNSIGNED),6);
  SET v_h=COALESCE(JSON_VALUE(p_payload,'$.gridH' RETURNING UNSIGNED),4);
  SET v_min_w=COALESCE(JSON_VALUE(p_payload,'$.minW' RETURNING UNSIGNED),2);
  SET v_min_h=COALESCE(JSON_VALUE(p_payload,'$.minH' RETURNING UNSIGNED),2);
  IF v_w=0 OR v_h=0 OR v_x+v_w>12 OR v_w<v_min_w OR v_h<v_min_h THEN SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT='INVALID_DASHBOARD_PANEL_GRID'; END IF;
  START TRANSACTION;
  SELECT t.id INTO v_tab FROM dashboard_tabs t JOIN dashboards d ON d.id=t.dashboard_id WHERE d.guid=p_dashboard_guid AND t.guid=p_tab_guid AND t.status='ACTIVE' FOR UPDATE;
  IF v_tab IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_TAB_NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM dashboard_panels p WHERE p.tab_id=v_tab AND v_x<p.grid_x+p.grid_w AND v_x+v_w>p.grid_x AND v_y<p.grid_y+p.grid_h AND v_y+v_h>p.grid_y) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_PANEL_OVERLAP'; END IF;
  INSERT INTO dashboard_panels(guid,tab_id,title,description,panel_type,status,grid_x,grid_y,grid_w,grid_h,min_w,min_h,max_w,max_h,sort_order,is_collapsed,is_locked,is_visible,is_resizable,is_draggable,visualization_config,query_config,display_config,version,created_by)
  VALUES(UUID(),v_tab,JSON_UNQUOTE(JSON_EXTRACT(p_payload,'$.title')),JSON_UNQUOTE(JSON_EXTRACT(p_payload,'$.description')),JSON_UNQUOTE(JSON_EXTRACT(p_payload,'$.panelType')),'ACTIVE',v_x,v_y,v_w,v_h,v_min_w,v_min_h,JSON_VALUE(p_payload,'$.maxW' RETURNING UNSIGNED),JSON_VALUE(p_payload,'$.maxH' RETURNING UNSIGNED),COALESCE(JSON_VALUE(p_payload,'$.sortOrder' RETURNING UNSIGNED),0),COALESCE(JSON_VALUE(p_payload,'$.isCollapsed' RETURNING UNSIGNED),0),COALESCE(JSON_VALUE(p_payload,'$.isLocked' RETURNING UNSIGNED),0),COALESCE(JSON_VALUE(p_payload,'$.isVisible' RETURNING UNSIGNED),1),COALESCE(JSON_VALUE(p_payload,'$.isResizable' RETURNING UNSIGNED),1),COALESCE(JSON_VALUE(p_payload,'$.isDraggable' RETURNING UNSIGNED),1),JSON_EXTRACT(p_payload,'$.visualizationConfig'),JSON_EXTRACT(p_payload,'$.queryConfig'),JSON_EXTRACT(p_payload,'$.displayConfig'),1,p_actor);
  SET v_id=LAST_INSERT_ID(); COMMIT; SELECT * FROM dashboard_panels WHERE id=v_id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_panel_update$$
CREATE PROCEDURE sp_dashboard_panel_update(IN p_dashboard_guid CHAR(36),IN p_tab_guid CHAR(36),IN p_panel_guid CHAR(36),IN p_payload JSON,IN p_expected INT UNSIGNED,IN p_actor BIGINT UNSIGNED)
BEGIN
  DECLARE v_id BIGINT UNSIGNED; DECLARE v_version INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT p.id,p.version INTO v_id,v_version FROM dashboard_panels p JOIN dashboard_tabs t ON t.id=p.tab_id JOIN dashboards d ON d.id=t.dashboard_id WHERE d.guid=p_dashboard_guid AND t.guid=p_tab_guid AND p.guid=p_panel_guid FOR UPDATE;
  IF v_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_PANEL_NOT_FOUND'; END IF;
  IF v_version<>p_expected THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_VERSION_CONFLICT'; END IF;
  IF JSON_CONTAINS_PATH(p_payload,'one','$.gridX') OR JSON_CONTAINS_PATH(p_payload,'one','$.gridY') OR JSON_CONTAINS_PATH(p_payload,'one','$.gridW') OR JSON_CONTAINS_PATH(p_payload,'one','$.gridH') THEN SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT='LAYOUT_MUST_USE_SAVE_LAYOUT'; END IF;
  UPDATE dashboard_panels SET title=COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p_payload,'$.title')),title),description=IF(JSON_CONTAINS_PATH(p_payload,'one','$.description'),JSON_UNQUOTE(JSON_EXTRACT(p_payload,'$.description')),description),panel_type=COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p_payload,'$.panelType')),panel_type),visualization_config=IF(JSON_CONTAINS_PATH(p_payload,'one','$.visualizationConfig'),JSON_EXTRACT(p_payload,'$.visualizationConfig'),visualization_config),query_config=IF(JSON_CONTAINS_PATH(p_payload,'one','$.queryConfig'),JSON_EXTRACT(p_payload,'$.queryConfig'),query_config),display_config=IF(JSON_CONTAINS_PATH(p_payload,'one','$.displayConfig'),JSON_EXTRACT(p_payload,'$.displayConfig'),display_config),is_collapsed=COALESCE(JSON_VALUE(p_payload,'$.isCollapsed' RETURNING UNSIGNED),is_collapsed),is_locked=COALESCE(JSON_VALUE(p_payload,'$.isLocked' RETURNING UNSIGNED),is_locked),is_visible=COALESCE(JSON_VALUE(p_payload,'$.isVisible' RETURNING UNSIGNED),is_visible),is_resizable=COALESCE(JSON_VALUE(p_payload,'$.isResizable' RETURNING UNSIGNED),is_resizable),is_draggable=COALESCE(JSON_VALUE(p_payload,'$.isDraggable' RETURNING UNSIGNED),is_draggable),version=version+1,updated_by=p_actor,updated_at=CURRENT_TIMESTAMP(3) WHERE id=v_id;
  COMMIT; SELECT * FROM dashboard_panels WHERE id=v_id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_panel_duplicate$$
CREATE PROCEDURE sp_dashboard_panel_duplicate(IN p_dashboard_guid CHAR(36),IN p_tab_guid CHAR(36),IN p_panel_guid CHAR(36),IN p_actor BIGINT UNSIGNED)
BEGIN
  DECLARE v_tab BIGINT UNSIGNED; DECLARE v_id BIGINT UNSIGNED; DECLARE v_x INT UNSIGNED; DECLARE v_y INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT p.tab_id,p.grid_x,p.grid_y INTO v_tab,v_x,v_y FROM dashboard_panels p JOIN dashboard_tabs t ON t.id=p.tab_id JOIN dashboards d ON d.id=t.dashboard_id WHERE d.guid=p_dashboard_guid AND t.guid=p_tab_guid AND p.guid=p_panel_guid FOR UPDATE;
  IF v_tab IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_PANEL_NOT_FOUND'; END IF;
  SELECT COALESCE(MAX(grid_y+grid_h),v_y+1) INTO v_y FROM dashboard_panels WHERE tab_id=v_tab;
  INSERT INTO dashboard_panels(guid,tab_id,title,description,panel_type,status,grid_x,grid_y,grid_w,grid_h,min_w,min_h,max_w,max_h,sort_order,is_collapsed,is_locked,is_visible,is_resizable,is_draggable,visualization_config,query_config,display_config,version,created_by)
    SELECT UUID(),tab_id,LEFT(CONCAT(title,' (copy)'),200),description,panel_type,'ACTIVE',grid_x,v_y,grid_w,grid_h,min_w,min_h,max_w,max_h,sort_order+1,is_collapsed,0,is_visible,is_resizable,is_draggable,visualization_config,query_config,display_config,1,p_actor FROM dashboard_panels WHERE guid=p_panel_guid AND tab_id=v_tab;
  SET v_id=LAST_INSERT_ID(); COMMIT; SELECT * FROM dashboard_panels WHERE id=v_id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_panel_move$$
CREATE PROCEDURE sp_dashboard_panel_move(IN p_dashboard_guid CHAR(36),IN p_source_tab_guid CHAR(36),IN p_panel_guid CHAR(36),IN p_target_tab_guid CHAR(36),IN p_x INT UNSIGNED,IN p_y INT UNSIGNED,IN p_expected INT UNSIGNED,IN p_actor BIGINT UNSIGNED)
BEGIN
  DECLARE v_panel BIGINT UNSIGNED; DECLARE v_source BIGINT UNSIGNED; DECLARE v_target BIGINT UNSIGNED; DECLARE v_version INT UNSIGNED; DECLARE v_w INT UNSIGNED; DECLARE v_h INT UNSIGNED; DECLARE v_locked TINYINT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT t.id INTO v_source FROM dashboard_tabs t JOIN dashboards d ON d.id=t.dashboard_id WHERE t.guid=p_source_tab_guid AND d.guid=p_dashboard_guid FOR UPDATE;
  SELECT id INTO v_target FROM dashboard_tabs t JOIN dashboards d ON d.id=t.dashboard_id WHERE d.guid=p_dashboard_guid AND t.guid=p_target_tab_guid AND t.status='ACTIVE' FOR UPDATE;
  SELECT p.id,p.version,p.grid_w,p.grid_h,p.is_locked INTO v_panel,v_version,v_w,v_h,v_locked FROM dashboard_panels p WHERE p.guid=p_panel_guid AND p.tab_id=v_source FOR UPDATE;
  IF v_panel IS NULL OR v_target IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_PANEL_MOVE_INVALID'; END IF;
  IF v_version<>p_expected THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_VERSION_CONFLICT'; END IF;
  IF v_locked=1 OR (SELECT is_draggable FROM dashboard_panels WHERE id=v_panel)=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_PANEL_LOCKED'; END IF;
  IF p_x+v_w>12 OR (SELECT is_draggable FROM dashboard_panels WHERE id=v_panel)=0 OR EXISTS(SELECT 1 FROM dashboard_panels p WHERE p.tab_id=v_target AND p.id<>v_panel AND p_x<p.grid_x+p.grid_w AND p_x+v_w>p.grid_x AND p_y<p.grid_y+p.grid_h AND p_y+v_h>p.grid_y) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_PANEL_OVERLAP'; END IF;
  UPDATE dashboard_panels SET tab_id=v_target,grid_x=p_x,grid_y=p_y,version=version+1,updated_by=p_actor,updated_at=CURRENT_TIMESTAMP(3) WHERE id=v_panel;
  COMMIT; SELECT * FROM dashboard_panels WHERE id=v_panel;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_panel_set_status$$
CREATE PROCEDURE sp_dashboard_panel_set_status(IN p_dashboard_guid CHAR(36),IN p_tab_guid CHAR(36),IN p_panel_guid CHAR(36),IN p_status VARCHAR(20),IN p_expected INT UNSIGNED,IN p_actor BIGINT UNSIGNED)
BEGIN
  DECLARE v_id BIGINT UNSIGNED; DECLARE v_version INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT p.id,p.version INTO v_id,v_version FROM dashboard_panels p JOIN dashboard_tabs t ON t.id=p.tab_id JOIN dashboards d ON d.id=t.dashboard_id WHERE d.guid=p_dashboard_guid AND t.guid=p_tab_guid AND p.guid=p_panel_guid FOR UPDATE;
  IF v_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_PANEL_NOT_FOUND'; END IF;
  IF v_version<>p_expected THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_VERSION_CONFLICT'; END IF;
  IF p_status NOT IN ('ACTIVE','INACTIVE') THEN SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT='INVALID_DASHBOARD_PANEL_STATUS'; END IF;
  UPDATE dashboard_panels SET status=p_status,version=version+1,updated_by=p_actor,updated_at=CURRENT_TIMESTAMP(3) WHERE id=v_id;
  COMMIT; SELECT * FROM dashboard_panels WHERE id=v_id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_panel_delete$$
CREATE PROCEDURE sp_dashboard_panel_delete(IN p_dashboard_guid CHAR(36),IN p_tab_guid CHAR(36),IN p_panel_guid CHAR(36))
BEGIN
  DELETE p FROM dashboard_panels p JOIN dashboard_tabs t ON t.id=p.tab_id JOIN dashboards d ON d.id=t.dashboard_id WHERE d.guid=p_dashboard_guid AND t.guid=p_tab_guid AND p.guid=p_panel_guid;
  SELECT ROW_COUNT() AS deleted;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_panel_save_layout$$
CREATE PROCEDURE sp_dashboard_panel_save_layout(IN p_dashboard_guid CHAR(36),IN p_tab_guid CHAR(36),IN p_layout JSON,IN p_actor BIGINT UNSIGNED)
BEGIN
  DECLARE v_tab BIGINT UNSIGNED; DECLARE v_count INT UNSIGNED; DECLARE v_layout_count INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF p_layout IS NULL OR JSON_TYPE(p_layout)<>'ARRAY' OR p_actor IS NULL THEN SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT='INVALID_DASHBOARD_PANEL_LAYOUT'; END IF;
  START TRANSACTION;
  SELECT t.id INTO v_tab FROM dashboard_tabs t JOIN dashboards d ON d.id=t.dashboard_id WHERE d.guid=p_dashboard_guid AND t.guid=p_tab_guid FOR UPDATE;
  IF v_tab IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_TAB_NOT_FOUND'; END IF;
  SELECT COUNT(*) INTO v_count FROM dashboard_panels WHERE tab_id=v_tab;
  SET v_layout_count=JSON_LENGTH(p_layout);
  IF v_count<>v_layout_count OR (SELECT COUNT(DISTINCT j.guid) FROM JSON_TABLE(p_layout,'$[*]' COLUMNS(guid CHAR(36) PATH '$.guid')) j)<>v_layout_count OR
    (SELECT COUNT(*) FROM JSON_TABLE(p_layout,'$[*]' COLUMNS(guid CHAR(36) PATH '$.guid',x INT UNSIGNED PATH '$.gridX',y INT UNSIGNED PATH '$.gridY',w INT UNSIGNED PATH '$.gridW',h INT UNSIGNED PATH '$.gridH',version INT UNSIGNED PATH '$.expectedVersion')) j LEFT JOIN dashboard_panels p ON p.guid=j.guid AND p.tab_id=v_tab WHERE p.id IS NULL OR p.version<>j.version OR j.w=0 OR j.h=0 OR j.x+j.w>12 OR j.w<p.min_w OR j.h<p.min_h OR (p.max_w IS NOT NULL AND j.w>p.max_w) OR (p.max_h IS NOT NULL AND j.h>p.max_h) OR (p.is_locked=1 AND (j.x<>p.grid_x OR j.y<>p.grid_y OR j.w<>p.grid_w OR j.h<>p.grid_h)) OR (p.is_draggable=0 AND (j.x<>p.grid_x OR j.y<>p.grid_y)) OR (p.is_resizable=0 AND (j.w<>p.grid_w OR j.h<>p.grid_h)))>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INVALID_DASHBOARD_PANEL_LAYOUT';
  END IF;
  IF EXISTS(SELECT 1 FROM JSON_TABLE(p_layout,'$[*]' COLUMNS(guid CHAR(36) PATH '$.guid',x INT UNSIGNED PATH '$.gridX',y INT UNSIGNED PATH '$.gridY',w INT UNSIGNED PATH '$.gridW',h INT UNSIGNED PATH '$.gridH')) a JOIN JSON_TABLE(p_layout,'$[*]' COLUMNS(guid CHAR(36) PATH '$.guid',x INT UNSIGNED PATH '$.gridX',y INT UNSIGNED PATH '$.gridY',w INT UNSIGNED PATH '$.gridW',h INT UNSIGNED PATH '$.gridH')) b ON a.guid<b.guid AND a.x<b.x+b.w AND a.x+a.w>b.x AND a.y<b.y+b.h AND a.y+a.h>b.y) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_PANEL_OVERLAP'; END IF;
  UPDATE dashboard_panels p JOIN JSON_TABLE(p_layout,'$[*]' COLUMNS(guid CHAR(36) PATH '$.guid',x INT UNSIGNED PATH '$.gridX',y INT UNSIGNED PATH '$.gridY',w INT UNSIGNED PATH '$.gridW',h INT UNSIGNED PATH '$.gridH')) j ON j.guid=p.guid
  SET p.grid_x=j.x,p.grid_y=j.y,p.grid_w=j.w,p.grid_h=j.h,p.version=p.version+1,p.updated_by=p_actor,p.updated_at=CURRENT_TIMESTAMP(3) WHERE p.tab_id=v_tab;
  COMMIT; SELECT * FROM dashboard_panels WHERE tab_id=v_tab ORDER BY grid_y,grid_x,sort_order;
END$$

DELIMITER ;
