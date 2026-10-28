-- Apply after 0003 and 0004 in one Company database.
-- Adds a default General tab only where it is missing, then normalizes one active default per Dashboard.
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_dashboard_seed_default_tabs$$
CREATE PROCEDURE sp_dashboard_seed_default_tabs(IN p_actor BIGINT UNSIGNED)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF p_actor IS NULL THEN SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT='INVALID_DASHBOARD_TAB_ACTOR'; END IF;
  START TRANSACTION;
  INSERT INTO dashboard_tabs(guid,dashboard_id,name,description,sort_order,status,is_default,version,created_by)
  SELECT UUID(),d.id,'General',NULL,0,'ACTIVE',1,1,p_actor
  FROM dashboards d
  WHERE NOT EXISTS (SELECT 1 FROM dashboard_tabs t WHERE t.dashboard_id=d.id);
  UPDATE dashboard_tabs t
  JOIN (
    SELECT dashboard_id,
           COALESCE(
             MIN(CASE WHEN status='ACTIVE' AND is_default=1 THEN id END),
             MIN(CASE WHEN status='ACTIVE' THEN id END),
             MIN(id)
           ) AS default_tab_id
    FROM dashboard_tabs GROUP BY dashboard_id
  ) selected_tab ON selected_tab.dashboard_id=t.dashboard_id
  SET t.status=IF(t.id=selected_tab.default_tab_id,'ACTIVE',t.status),
      t.is_default=IF(t.id=selected_tab.default_tab_id,1,0);
  COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_create$$
CREATE PROCEDURE sp_dashboard_create(
  IN p_name VARCHAR(200),
  IN p_description TEXT,
  IN p_folder_id BIGINT UNSIGNED,
  IN p_tags JSON,
  IN p_created_by BIGINT UNSIGNED
)
BEGIN
  DECLARE v_dashboard_id BIGINT UNSIGNED;
  DECLARE v_dashboard_guid CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF p_name IS NULL OR CHAR_LENGTH(TRIM(p_name))=0 OR CHAR_LENGTH(p_name)>200 OR p_created_by IS NULL
     OR (p_tags IS NOT NULL AND JSON_TYPE(p_tags)<>'ARRAY') THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT='INVALID_DASHBOARD_CREATE';
  END IF;
  START TRANSACTION;
  SET v_dashboard_guid=UUID();
  INSERT INTO dashboards(guid,name,description,folder_id,tags,status,version,created_by)
  VALUES(v_dashboard_guid,TRIM(p_name),p_description,p_folder_id,COALESCE(p_tags,JSON_ARRAY()),'ACTIVE',1,p_created_by);
  SET v_dashboard_id=LAST_INSERT_ID();
  INSERT INTO dashboard_tabs(guid,dashboard_id,name,description,sort_order,status,is_default,version,created_by)
  VALUES(UUID(),v_dashboard_id,'General',NULL,0,'ACTIVE',1,1,p_created_by);
  COMMIT;
  SELECT id,guid,name,description,folder_id,tags,status,version,created_at,created_by,updated_at,updated_by
  FROM dashboards WHERE id=v_dashboard_id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_duplicate$$
CREATE PROCEDURE sp_dashboard_duplicate(
  IN p_guid CHAR(36),
  IN p_new_name VARCHAR(200),
  IN p_include_panels TINYINT,
  IN p_created_by BIGINT UNSIGNED
)
BEGIN
  DECLARE v_source_id BIGINT UNSIGNED;
  DECLARE v_new_id BIGINT UNSIGNED;
  DECLARE v_tab_count INT UNSIGNED;
  DECLARE v_old_tab_id BIGINT UNSIGNED;
  DECLARE v_new_tab_id BIGINT UNSIGNED;
  DECLARE v_tab_name VARCHAR(150);
  DECLARE v_tab_description TEXT;
  DECLARE v_sort_order INT UNSIGNED;
  DECLARE v_status VARCHAR(20);
  DECLARE v_is_default TINYINT;
  DECLARE v_done TINYINT DEFAULT 0;
  DECLARE tabs_cursor CURSOR FOR
    SELECT id,name,description,sort_order,status,is_default
    FROM dashboard_tabs WHERE dashboard_id=v_source_id ORDER BY sort_order,id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done=1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF p_created_by IS NULL OR p_include_panels IS NULL OR p_include_panels NOT IN (0,1)
     OR (p_new_name IS NOT NULL AND CHAR_LENGTH(TRIM(p_new_name))=0) THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT='INVALID_DASHBOARD_DUPLICATE';
  END IF;
  START TRANSACTION;
  SELECT id INTO v_source_id FROM dashboards WHERE guid=p_guid FOR UPDATE;
  IF v_source_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_NOT_FOUND'; END IF;
  INSERT INTO dashboards(guid,name,description,folder_id,tags,status,version,created_by)
  SELECT UUID(),COALESCE(TRIM(p_new_name),LEFT(CONCAT(name,' (copy)'),200)),description,folder_id,tags,'ACTIVE',1,p_created_by
  FROM dashboards WHERE id=v_source_id;
  SET v_new_id=LAST_INSERT_ID();

  SELECT COUNT(*) INTO v_tab_count FROM dashboard_tabs WHERE dashboard_id=v_source_id;
  IF v_tab_count=0 THEN
    INSERT INTO dashboard_tabs(guid,dashboard_id,name,description,sort_order,status,is_default,version,created_by)
    VALUES(UUID(),v_new_id,'General',NULL,0,'ACTIVE',1,1,p_created_by);
  ELSE
    OPEN tabs_cursor;
    copy_tabs: LOOP
      FETCH tabs_cursor INTO v_old_tab_id,v_tab_name,v_tab_description,v_sort_order,v_status,v_is_default;
      IF v_done=1 THEN LEAVE copy_tabs; END IF;
      INSERT INTO dashboard_tabs(guid,dashboard_id,name,description,sort_order,status,is_default,version,created_by)
      VALUES(UUID(),v_new_id,v_tab_name,v_tab_description,v_sort_order,v_status,v_is_default,1,p_created_by);
      SET v_new_tab_id=LAST_INSERT_ID();
      IF p_include_panels=1 THEN
        INSERT INTO dashboard_panels(guid,tab_id,title,description,panel_type,status,grid_x,grid_y,grid_w,grid_h,min_w,min_h,max_w,max_h,sort_order,is_collapsed,is_locked,is_visible,is_resizable,is_draggable,visualization_config,query_config,display_config,version,created_by)
        SELECT UUID(),v_new_tab_id,p.title,p.description,p.panel_type,p.status,p.grid_x,p.grid_y,p.grid_w,p.grid_h,p.min_w,p.min_h,p.max_w,p.max_h,p.sort_order,p.is_collapsed,p.is_locked,p.is_visible,p.is_resizable,p.is_draggable,p.visualization_config,p.query_config,p.display_config,1,p_created_by
        FROM dashboard_panels p WHERE p.tab_id=v_old_tab_id;
      END IF;
    END LOOP;
    CLOSE tabs_cursor;
  END IF;
  COMMIT;
  SELECT id,guid,name,description,folder_id,tags,status,version,created_at,created_by,updated_at,updated_by
  FROM dashboards WHERE id=v_new_id;
END$$

DROP PROCEDURE IF EXISTS sp_dashboard_delete$$
CREATE PROCEDURE sp_dashboard_delete(IN p_guid CHAR(36))
BEGIN
  DECLARE v_id BIGINT UNSIGNED;
  DECLARE v_referencing_tables INT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_id FROM dashboards WHERE guid=p_guid FOR UPDATE;
  IF v_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_NOT_FOUND'; END IF;
  DELETE p FROM dashboard_panels p
  JOIN dashboard_tabs t ON t.id=p.tab_id
  WHERE t.dashboard_id=v_id;
  DELETE FROM dashboard_tabs WHERE dashboard_id=v_id;
  SELECT COUNT(*) INTO v_referencing_tables
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA=DATABASE()
    AND REFERENCED_TABLE_NAME='dashboards'
    AND TABLE_NAME<>'dashboard_tabs';
  IF v_referencing_tables>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DASHBOARD_DELETE_BLOCKED'; END IF;
  DELETE FROM dashboards WHERE id=v_id;
  COMMIT;
  SELECT 1 AS deleted;
END$$

DELIMITER ;

-- Run once during migration with a valid user ID after reviewing dashboards without Tabs:
-- CALL sp_dashboard_seed_default_tabs(<ACTOR_USER_ID>);
