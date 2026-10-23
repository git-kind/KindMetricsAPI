-- =========================================================================
-- MIGRACIÓN ADITIVA: ESTRUCTURA DE LA TABLA COMPANIES
-- =========================================================================

-- Agregamos las columnas una por una validando si no existen (versión compatible con scripts de despliegue)
SET @dropdown_check = (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'companies' AND table_schema = DATABASE() AND column_name = 'razon_social');
IF @dropdown_check = 0 THEN
    ALTER TABLE companies ADD COLUMN razon_social VARCHAR(255) NULL;
END IF;

SET @dropdown_check = (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'companies' AND table_schema = DATABASE() AND column_name = 'rfc');
IF @dropdown_check = 0 THEN
    ALTER TABLE companies ADD COLUMN rfc VARCHAR(50) NULL;
    ALTER TABLE companies ADD UNIQUE KEY uq_companies_rfc (rfc);
END IF;

SET @dropdown_check = (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'companies' AND table_schema = DATABASE() AND column_name = 'direccion');
IF @dropdown_check = 0 THEN
    ALTER TABLE companies ADD COLUMN direccion VARCHAR(500) NULL;
END IF;

SET @dropdown_check = (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'companies' AND table_schema = DATABASE() AND column_name = 'telefono');
IF @dropdown_check = 0 THEN
    ALTER TABLE companies ADD COLUMN telefono VARCHAR(50) NULL;
END IF;

SET @dropdown_check = (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'companies' AND table_schema = DATABASE() AND column_name = 'estado');
IF @dropdown_check = 0 THEN
    ALTER TABLE companies ADD COLUMN estado VARCHAR(50) NULL DEFAULT 'activo';
END IF;

SET @dropdown_check = (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'companies' AND table_schema = DATABASE() AND column_name = 'fecha_registro');
IF @dropdown_check = 0 THEN
    ALTER TABLE companies ADD COLUMN fecha_registro TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;
END IF;

-- =========================================================================
-- STORED PROCEDURES: LOGICA DEL CRUD SINCRONIZADA
-- =========================================================================
-- dbeaver:delimiter //

DROP PROCEDURE IF EXISTS sp_create_company //

CREATE PROCEDURE sp_create_company(
    IN p_name VARCHAR(100),
    IN p_razon_social VARCHAR(255),
    IN p_rfc VARCHAR(50),
    IN p_direccion VARCHAR(500),
    IN p_telefono VARCHAR(50)
)
BEGIN
    INSERT INTO companies (name, razon_social, rfc, direccion, telefono, estado)
    VALUES (p_name, p_razon_social, p_rfc, p_direccion, p_telefono, 'activo');
    
    SELECT * FROM companies WHERE id = LAST_INSERT_ID();
END //

DROP PROCEDURE IF EXISTS sp_update_company //

CREATE PROCEDURE sp_update_company(
    IN p_id INT,
    IN p_name VARCHAR(100),
    IN p_razon_social VARCHAR(255),
    IN p_rfc VARCHAR(50),
    IN p_direccion VARCHAR(500),
    IN p_telefono VARCHAR(50)
)
BEGIN
    UPDATE companies 
    SET name = p_name, 
        razon_social = p_razon_social, 
        rfc = p_rfc, 
        direccion = p_direccion, 
        telefono = p_telefono
    WHERE id = p_id;
    
    SELECT * FROM companies WHERE id = p_id;
END //

DROP PROCEDURE IF EXISTS sp_deactivate_company //

CREATE PROCEDURE sp_deactivate_company(
    IN p_id INT
)
BEGIN
    UPDATE companies 
    SET estado = 'inactivo'
    WHERE id = p_id;
    
    SELECT * FROM companies WHERE id = p_id;
END //

-- dbeaver:delimiter ;
