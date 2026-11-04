INSERT INTO companies (
    guid,
    name,
    code,
    description,
    timezone,
    locale,
    is_primary,
    status,
    razon_social,
    estado
)
SELECT
    UUID(),
    'Kind Technologies',
    'KIND',
    'Empresa principal de KindMetrics',
    'America/Mexico_City',
    'es',
    1,
    'ACTIVE',
    'Kind Technologies',
    'activo'
WHERE NOT EXISTS (
    SELECT 1
    FROM companies
    WHERE code = 'KIND'
);