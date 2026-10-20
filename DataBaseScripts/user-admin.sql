-- Crear contraseña desde Terminal con el siguiente comando:
-- node --input-type=module -e "import argon2 from 'argon2'; console.log(await argon2.hash('kindadmin', {type: argon2.argon2id}))"                    

INSERT INTO Users (
    guid,
    email,
    name,
    password_hash,
    is_platform_admin,
    status
)
VALUES (
    UUID(),
    'admin@kindtech.com',
    'Admin Erick',
    '$argon2id$v=19$m=65536,t=3,p=4$erw4KDQFhlo0kipBYvNhOQ$CasSsn7WSIdQQNuK/li2l7Ae2kn9dUnCKpLOja4LBD0',
    1,
    'ACTIVE'
);