INSERT INTO companies (
    guid,
    name,
    code,
    description,
    timezone,
    locale,
    is_primary,
    status
)
VALUES (
    UUID(),
    'Kind Technologies',
    'KIND',
    'Empresa principal de KindMetrics',
    'America/Mexico_City',
    'es',
    1,
    'ACTIVE'
);