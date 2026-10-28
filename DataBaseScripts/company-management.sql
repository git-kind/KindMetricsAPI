-- Esquema de referencia para la tabla companies.
-- No modifica la tabla si ya existe; el CRUD usa los nombres y nulabilidad
-- definidos aquí y preserva las columnas de la arquitectura multiempresa.
CREATE TABLE IF NOT EXISTS `companies` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `guid` char(36) NOT NULL,
  `name` varchar(160) NOT NULL,
  `code` varchar(40) NOT NULL,
  `description` text,
  `timezone` varchar(80) NOT NULL DEFAULT 'UTC',
  `locale` varchar(5) NOT NULL DEFAULT 'es',
  `config` json DEFAULT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `razon_social` varchar(255) NOT NULL,
  `rfc` varchar(50) DEFAULT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  `estado` varchar(50) DEFAULT 'activo',
  PRIMARY KEY (`id`),
  UNIQUE KEY `guid` (`guid`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;
