-- Apply only after 0001-dashboards-schema.sql in the selected Company database.
DROP PROCEDURE IF EXISTS sp_dashboard_list;
DROP PROCEDURE IF EXISTS sp_dashboard_get;
DROP PROCEDURE IF EXISTS sp_dashboard_create;
DROP PROCEDURE IF EXISTS sp_dashboard_update;
DROP PROCEDURE IF EXISTS sp_dashboard_duplicate;
DROP PROCEDURE IF EXISTS sp_dashboard_set_status;
DROP PROCEDURE IF EXISTS sp_dashboard_delete;

DELIMITER $$

CREATE PROCEDURE sp_dashboard_list(
  IN p_search VARCHAR(200),
  IN p_folder_id BIGINT UNSIGNED,
  IN p_status VARCHAR(20),
  IN p_tags JSON,
  IN p_page INT UNSIGNED,
  IN p_page_size INT UNSIGNED,
  IN p_sort_by VARCHAR(20),
  IN p_sort_direction VARCHAR(4),
  IN p_include_inactive TINYINT
)
BEGIN
  IF p_page IS NULL OR p_page < 1 OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100
     OR p_sort_by IS NULL OR p_sort_direction IS NULL OR p_include_inactive IS NULL
     OR p_sort_by NOT IN ('name', 'createdAt', 'updatedAt', 'status')
     OR p_sort_direction NOT IN ('ASC', 'DESC')
     OR (p_status IS NOT NULL AND p_status NOT IN ('ACTIVE', 'INACTIVE'))
     OR (p_tags IS NOT NULL AND JSON_TYPE(p_tags) <> 'ARRAY') THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_FILTER';
  END IF;

  SELECT d.id, d.guid, d.name, d.description, d.folder_id, d.tags, d.status, d.version,
         d.created_at, d.created_by, d.updated_at, d.updated_by
  FROM dashboards d
  WHERE (p_search IS NULL OR d.name LIKE CONCAT('%', p_search, '%')
         OR COALESCE(d.description, '') LIKE CONCAT('%', p_search, '%'))
    AND (p_folder_id IS NULL OR d.folder_id = p_folder_id)
    AND (p_status IS NULL OR d.status = p_status)
    AND (p_tags IS NULL OR JSON_CONTAINS(d.tags, p_tags))
    AND (p_include_inactive = 1 OR d.status = 'ACTIVE')
  ORDER BY
    CASE WHEN p_sort_by = 'name' AND p_sort_direction = 'ASC' THEN d.name END ASC,
    CASE WHEN p_sort_by = 'name' AND p_sort_direction = 'DESC' THEN d.name END DESC,
    CASE WHEN p_sort_by = 'createdAt' AND p_sort_direction = 'ASC' THEN d.created_at END ASC,
    CASE WHEN p_sort_by = 'createdAt' AND p_sort_direction = 'DESC' THEN d.created_at END DESC,
    CASE WHEN p_sort_by = 'updatedAt' AND p_sort_direction = 'ASC' THEN d.updated_at END ASC,
    CASE WHEN p_sort_by = 'updatedAt' AND p_sort_direction = 'DESC' THEN d.updated_at END DESC,
    CASE WHEN p_sort_by = 'status' AND p_sort_direction = 'ASC' THEN d.status END ASC,
    CASE WHEN p_sort_by = 'status' AND p_sort_direction = 'DESC' THEN d.status END DESC,
    d.id DESC
  LIMIT p_page_size OFFSET (p_page - 1) * p_page_size;

  SELECT COUNT(*) AS total_count
  FROM dashboards d
  WHERE (p_search IS NULL OR d.name LIKE CONCAT('%', p_search, '%')
         OR COALESCE(d.description, '') LIKE CONCAT('%', p_search, '%'))
    AND (p_folder_id IS NULL OR d.folder_id = p_folder_id)
    AND (p_status IS NULL OR d.status = p_status)
    AND (p_tags IS NULL OR JSON_CONTAINS(d.tags, p_tags))
    AND (p_include_inactive = 1 OR d.status = 'ACTIVE');
END$$

CREATE PROCEDURE sp_dashboard_get(IN p_guid CHAR(36), IN p_include_inactive TINYINT)
BEGIN
  SELECT id, guid, name, description, folder_id, tags, status, version,
         created_at, created_by, updated_at, updated_by
  FROM dashboards
  WHERE guid = p_guid AND (p_include_inactive = 1 OR status = 'ACTIVE')
  LIMIT 1;
END$$

CREATE PROCEDURE sp_dashboard_create(
  IN p_name VARCHAR(200),
  IN p_description TEXT,
  IN p_folder_id BIGINT UNSIGNED,
  IN p_tags JSON,
  IN p_created_by BIGINT UNSIGNED
)
BEGIN
  DECLARE v_id BIGINT UNSIGNED;
  DECLARE v_tag_index INT UNSIGNED DEFAULT 0;
  DECLARE v_tag_count INT UNSIGNED DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_name IS NULL OR CHAR_LENGTH(TRIM(p_name)) = 0 OR CHAR_LENGTH(p_name) > 200
     OR CHAR_LENGTH(p_description) > 20000 OR p_created_by IS NULL
     OR p_folder_id = 0
     OR (p_tags IS NOT NULL AND (JSON_TYPE(p_tags) <> 'ARRAY' OR JSON_LENGTH(p_tags) > 50)) THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_CREATE';
  END IF;

  IF p_tags IS NOT NULL THEN
    SET v_tag_count = JSON_LENGTH(p_tags);
    WHILE v_tag_index < v_tag_count DO
      IF JSON_TYPE(JSON_EXTRACT(p_tags, CONCAT('$[', v_tag_index, ']'))) <> 'STRING'
         OR CHAR_LENGTH(TRIM(JSON_UNQUOTE(JSON_EXTRACT(p_tags, CONCAT('$[', v_tag_index, ']'))))) = 0
         OR CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(p_tags, CONCAT('$[', v_tag_index, ']')))) > 100 THEN
        SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_TAG';
      END IF;
      SET v_tag_index = v_tag_index + 1;
    END WHILE;
  END IF;

  START TRANSACTION;
  INSERT INTO dashboards (guid, name, description, folder_id, tags, status, version, created_by)
  VALUES (UUID(), TRIM(p_name), p_description, p_folder_id, COALESCE(p_tags, JSON_ARRAY()), 'ACTIVE', 1, p_created_by);
  SET v_id = LAST_INSERT_ID();
  COMMIT;

  SELECT id, guid, name, description, folder_id, tags, status, version,
         created_at, created_by, updated_at, updated_by
  FROM dashboards WHERE id = v_id;
END$$

CREATE PROCEDURE sp_dashboard_update(
  IN p_guid CHAR(36),
  IN p_properties JSON,
  IN p_expected_version INT UNSIGNED,
  IN p_updated_by BIGINT UNSIGNED
)
BEGIN
  DECLARE v_version INT UNSIGNED DEFAULT NULL;
  DECLARE v_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_tags JSON DEFAULT NULL;
  DECLARE v_tag_index INT UNSIGNED DEFAULT 0;
  DECLARE v_tag_count INT UNSIGNED DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_guid IS NULL OR p_expected_version IS NULL OR p_updated_by IS NULL
     OR p_properties IS NULL OR JSON_TYPE(p_properties) <> 'OBJECT'
     OR (JSON_CONTAINS_PATH(p_properties, 'one', '$.name')
         AND (JSON_TYPE(JSON_EXTRACT(p_properties, '$.name')) <> 'STRING'
              OR CHAR_LENGTH(TRIM(JSON_UNQUOTE(JSON_EXTRACT(p_properties, '$.name')))) = 0
              OR CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(p_properties, '$.name'))) > 200))
     OR (JSON_CONTAINS_PATH(p_properties, 'one', '$.description')
         AND JSON_TYPE(JSON_EXTRACT(p_properties, '$.description')) NOT IN ('NULL', 'STRING'))
     OR (JSON_CONTAINS_PATH(p_properties, 'one', '$.description')
         AND CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(p_properties, '$.description'))) > 20000)
     OR (JSON_CONTAINS_PATH(p_properties, 'one', '$.folderId')
         AND JSON_TYPE(JSON_EXTRACT(p_properties, '$.folderId')) NOT IN ('NULL', 'INTEGER'))
     OR (JSON_CONTAINS_PATH(p_properties, 'one', '$.tags')
         AND (JSON_TYPE(JSON_EXTRACT(p_properties, '$.tags')) <> 'ARRAY'
              OR JSON_LENGTH(JSON_EXTRACT(p_properties, '$.tags')) > 50))
     OR (JSON_CONTAINS_PATH(p_properties, 'one', '$.folderId')
         AND JSON_TYPE(JSON_EXTRACT(p_properties, '$.folderId')) = 'INTEGER'
         AND CAST(JSON_UNQUOTE(JSON_EXTRACT(p_properties, '$.folderId')) AS UNSIGNED) = 0)
     OR JSON_LENGTH(p_properties) = 0 THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_UPDATE';
  END IF;

  IF JSON_CONTAINS_PATH(p_properties, 'one', '$.tags') THEN
    SET v_tags = JSON_EXTRACT(p_properties, '$.tags');
    SET v_tag_count = JSON_LENGTH(v_tags);
    WHILE v_tag_index < v_tag_count DO
      IF JSON_TYPE(JSON_EXTRACT(v_tags, CONCAT('$[', v_tag_index, ']'))) <> 'STRING'
         OR CHAR_LENGTH(TRIM(JSON_UNQUOTE(JSON_EXTRACT(v_tags, CONCAT('$[', v_tag_index, ']'))))) = 0
         OR CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(v_tags, CONCAT('$[', v_tag_index, ']')))) > 100 THEN
        SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_TAG';
      END IF;
      SET v_tag_index = v_tag_index + 1;
    END WHILE;
  END IF;

  START TRANSACTION;
  SELECT id, version INTO v_id, v_version
  FROM dashboards WHERE guid = p_guid FOR UPDATE;
  IF v_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_NOT_FOUND';
  END IF;
  IF v_version <> p_expected_version THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_VERSION_CONFLICT';
  END IF;

  UPDATE dashboards
  SET name = IF(JSON_CONTAINS_PATH(p_properties, 'one', '$.name'),
                JSON_UNQUOTE(JSON_EXTRACT(p_properties, '$.name')), name),
      description = IF(JSON_CONTAINS_PATH(p_properties, 'one', '$.description'),
                       IF(JSON_TYPE(JSON_EXTRACT(p_properties, '$.description')) = 'NULL',
                          NULL, JSON_UNQUOTE(JSON_EXTRACT(p_properties, '$.description'))), description),
      folder_id = IF(JSON_CONTAINS_PATH(p_properties, 'one', '$.folderId'),
                     IF(JSON_TYPE(JSON_EXTRACT(p_properties, '$.folderId')) = 'NULL',
                        NULL, CAST(JSON_UNQUOTE(JSON_EXTRACT(p_properties, '$.folderId')) AS UNSIGNED)), folder_id),
      tags = IF(JSON_CONTAINS_PATH(p_properties, 'one', '$.tags'),
                JSON_EXTRACT(p_properties, '$.tags'), tags),
      version = version + 1,
      updated_by = p_updated_by,
      updated_at = CURRENT_TIMESTAMP(3)
  WHERE id = v_id;
  COMMIT;

  SELECT id, guid, name, description, folder_id, tags, status, version,
         created_at, created_by, updated_at, updated_by
  FROM dashboards WHERE id = v_id;
END$$

CREATE PROCEDURE sp_dashboard_duplicate(
  IN p_guid CHAR(36),
  IN p_new_name VARCHAR(200),
  IN p_created_by BIGINT UNSIGNED
)
BEGIN
  DECLARE v_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_source_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_source_count INT UNSIGNED DEFAULT 0;
  DECLARE v_name VARCHAR(200);
  DECLARE v_description TEXT;
  DECLARE v_folder_id BIGINT UNSIGNED;
  DECLARE v_tags JSON;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_created_by IS NULL OR (p_new_name IS NOT NULL AND CHAR_LENGTH(TRIM(p_new_name)) = 0) THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_DUPLICATE';
  END IF;
  START TRANSACTION;
  SELECT COUNT(*) INTO v_source_count FROM dashboards WHERE guid = p_guid;
  IF v_source_count = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_NOT_FOUND';
  END IF;
  SELECT id, name, description, folder_id, tags
  INTO v_source_id, v_name, v_description, v_folder_id, v_tags
  FROM dashboards WHERE guid = p_guid FOR UPDATE;

  INSERT INTO dashboards (guid, name, description, folder_id, tags, status, version, created_by)
  VALUES (
    UUID(),
    COALESCE(TRIM(p_new_name), LEFT(CONCAT(v_name, ' (copy)'), 200)),
    v_description,
    v_folder_id,
    v_tags,
    'ACTIVE',
    1,
    p_created_by
  );
  SET v_id = LAST_INSERT_ID();
  COMMIT;

  SELECT id, guid, name, description, folder_id, tags, status, version,
         created_at, created_by, updated_at, updated_by
  FROM dashboards WHERE id = v_id;
END$$

CREATE PROCEDURE sp_dashboard_set_status(
  IN p_guid CHAR(36),
  IN p_status VARCHAR(20),
  IN p_expected_version INT UNSIGNED,
  IN p_updated_by BIGINT UNSIGNED
)
BEGIN
  DECLARE v_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_version INT UNSIGNED DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_status IS NULL OR p_status NOT IN ('ACTIVE', 'INACTIVE')
     OR p_expected_version IS NULL OR p_updated_by IS NULL THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'INVALID_DASHBOARD_STATUS';
  END IF;
  START TRANSACTION;
  SELECT id, version INTO v_id, v_version FROM dashboards WHERE guid = p_guid FOR UPDATE;
  IF v_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_NOT_FOUND';
  END IF;
  IF v_version <> p_expected_version THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_VERSION_CONFLICT';
  END IF;
  UPDATE dashboards
  SET status = p_status, version = version + 1, updated_by = p_updated_by, updated_at = CURRENT_TIMESTAMP(3)
  WHERE id = v_id;
  COMMIT;
  SELECT id, guid, name, description, folder_id, tags, status, version,
         created_at, created_by, updated_at, updated_by
  FROM dashboards WHERE id = v_id;
END$$

CREATE PROCEDURE sp_dashboard_delete(IN p_guid CHAR(36))
BEGIN
  DECLARE v_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_referencing_tables INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  SELECT id INTO v_id FROM dashboards WHERE guid = p_guid FOR UPDATE;
  IF v_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_NOT_FOUND';
  END IF;
  SELECT COUNT(*) INTO v_referencing_tables
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND REFERENCED_TABLE_NAME = 'dashboards';
  IF v_referencing_tables > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DASHBOARD_DELETE_BLOCKED';
  END IF;
  DELETE FROM dashboards WHERE id = v_id;
  COMMIT;
  SELECT 1 AS deleted;
END$$

DELIMITER ;
