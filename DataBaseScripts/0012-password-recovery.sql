-- Password recovery support for auth flow.
CREATE TABLE IF NOT EXISTS `password_recovery_tokens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `otp_hash` varchar(255) NOT NULL,
  `otp_expires_at` datetime NOT NULL,
  `used_at` datetime NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_password_recovery_user` (`user_id`),
  KEY `idx_password_recovery_pending` (`user_id`, `used_at`, `otp_expires_at`),
  CONSTRAINT `fk_password_recovery_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER //

DROP PROCEDURE IF EXISTS `sp_password_recovery_request`//
CREATE PROCEDURE `sp_password_recovery_request`(
  IN p_user_id BIGINT UNSIGNED,
  IN p_otp_hash VARCHAR(255),
  IN p_otp_expires_at DATETIME
)
BEGIN
  UPDATE `password_recovery_tokens`
  SET `used_at` = NOW()
  WHERE `user_id` = p_user_id
    AND `used_at` IS NULL
    AND `otp_expires_at` > NOW();

  INSERT INTO `password_recovery_tokens` (`user_id`, `otp_hash`, `otp_expires_at`)
  VALUES (p_user_id, p_otp_hash, p_otp_expires_at);
END //

DROP PROCEDURE IF EXISTS `sp_password_recovery_validate`//
CREATE PROCEDURE `sp_password_recovery_validate`(
  IN p_email VARCHAR(255)
)
BEGIN
  SELECT prt.`id`, prt.`user_id`, prt.`otp_hash`, prt.`otp_expires_at`, prt.`used_at`
  FROM `password_recovery_tokens` prt
  INNER JOIN `users` u ON u.`id` = prt.`user_id`
  WHERE LOWER(TRIM(u.`email`)) = LOWER(TRIM(p_email))
    AND prt.`used_at` IS NULL
    AND prt.`otp_expires_at` > NOW()
  ORDER BY prt.`created_at` DESC
  LIMIT 1;
END //

DROP PROCEDURE IF EXISTS `sp_password_recovery_reset`//
CREATE PROCEDURE `sp_password_recovery_reset`(
  IN p_user_id BIGINT UNSIGNED,
  IN p_token_id BIGINT UNSIGNED,
  IN p_password_hash VARCHAR(255)
)
BEGIN
  DECLARE v_locked_token_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_token_found TINYINT DEFAULT 1;
  DECLARE v_user_updated TINYINT DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_token_found = 0;

  START TRANSACTION;

  SELECT `id`
  INTO v_locked_token_id
  FROM `password_recovery_tokens`
  WHERE `id` = p_token_id
    AND `user_id` = p_user_id
    AND `used_at` IS NULL
    AND `otp_expires_at` > NOW()
  FOR UPDATE;

  IF v_token_found = 0 THEN
    ROLLBACK;
    SELECT 0 AS `updated`;
  ELSE
    UPDATE `users`
    SET `password_hash` = p_password_hash,
        `status` = 'ACTIVE'
    WHERE `id` = p_user_id;

    SET v_user_updated = ROW_COUNT();

    IF v_user_updated = 0 THEN
      ROLLBACK;
      SELECT 0 AS `updated`;
    ELSE
      UPDATE `password_recovery_tokens`
      SET `used_at` = NOW()
      WHERE `id` = p_token_id;

      COMMIT;
      SELECT 1 AS `updated`;
    END IF;
  END IF;
END //

DELIMITER ;
