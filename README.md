# KindMetricsAPI — proyecto base (v0.1.0)

## Arquitectura acordada

Node.js + TypeScript + Fastify; **Controllers / Models (DTOs) / Services / Repositories**. Dos implementaciones físicas: `Repositories/StoredProcedures` para CRUD administrativo mediante `CALL`, y `Repositories/Queries` para SELECT del editor. Swagger en `/docs` y OpenAPI en `/docs/json`. ESLint, Prettier, TypeScript strict y pruebas.

### Regla obligatoria: un bloque por componente de API

Esta regla aplica a todo endpoint nuevo y a cualquier reorganización del API existente:

1. **Un componente funcional equivale a un módulo de negocio** (por ejemplo, Auth, Users, Companies, Datasources o Dashboards). Cada componente debe tener un bloque de registro independiente en `src/Routes/ApiRoutes.ts`, bajo el prefijo `/api/v1`.
2. Cada bloque registra únicamente el Controller de ese componente. No mezclar endpoints de distintos componentes en un Controller ni registrar varias funcionalidades dentro de un bloque anónimo compartido.
3. Mantener el código del componente separado por responsabilidad: `Controllers/<Component>Controller.ts` (rutas), `Models/<Component>/` (DTOs y validación), `Services/<Component>Service.ts` (reglas de negocio), `Repositories/<Component>Repository.ts` (persistencia) y pruebas específicas del componente. Omitir una capa únicamente cuando el componente no la necesite.
4. Cada Controller declara juntos los endpoints de su componente, con sus contratos, esquemas Swagger, autenticación, permisos y respuestas. No colocar DTOs HTTP, lógica de negocio ni consultas de persistencia en ese bloque de rutas.
5. **Excepción acotada para CRUD idéntico:** los recursos pueden reutilizar un Controller genérico solo cuando compartan contrato y comportamiento. Aun así, cada recurso debe tener una entrada explícita de configuración con su alcance y autorización; si el contrato o las reglas divergen, se extrae a un componente/Controller propio.
6. No cambiar rutas públicas, contratos HTTP, permisos ni comportamiento al ordenar el código. Agregar o actualizar pruebas por componente y ejecutar `npm run check`.

El patrón de registro vigente está en `src/Routes/ApiRoutes.ts`; los CRUD compartidos están identificados individualmente en `src/Controllers/EntityController.ts`. Cualquier componente nuevo debe seguir la regla antes de considerarse completo.

### Regla obligatoria: acceso a datos de cada empresa

1. Los módulos que consultan o administran datos de una empresa (por ejemplo, dashboards, pestañas, paneles y procedimientos de dashboard) deben acceder a su base mediante `CompanyDatabaseRepository`; no deben ejecutar esas operaciones contra el catálogo administrativo ni crear conexiones directamente.
2. Cada solicitud debe autenticar al usuario y resolver `x-company-code` contra el catálogo administrativo. La empresa debe existir y estar activa, y el usuario debe tener asignación vigente; los administradores de plataforma conservan únicamente la excepción global ya definida por las políticas de autenticación. No confiar en la selección del frontend.
3. La resolución autorizada produce un `CompanyContext` que se pasa al repositorio de acceso a datos. `CompanyDatabaseRepository` y `CompanyConnectionService` usan ese contexto para buscar la configuración de conexión de la empresa en el catálogo, recuperar la base, usuario y contraseña cifrada, descifrar la contraseña y obtener el pool correspondiente. No aceptar nombres de base ni credenciales de conexión de la petición.
4. `DB_COMPANY_DATABASE`, `DB_COMPANY_USER` y `DB_COMPANY_PASSWORD` no son configuración de conexión en `.env`; el nombre de la base y las credenciales se obtienen del registro de la empresa en KindMetrics. El entorno solo puede proporcionar configuración común de transporte/servidor, como `DB_COMPANY_HOST`, `DB_COMPANY_PORT`, `DB_COMPANY_SSL` y límites de pool.
5. El pool debe permanecer aislado por empresa y reflejar cambios de configuración de conexión. Los stored procedures de datos de empresa se ejecutan únicamente en el pool de la empresa ya autorizada. Mantener las sentencias SQL de negocio en stored procedures y usar el ejecutor centralizado para llamarlos.
6. No omitir ni debilitar la autorización de `x-company-code` en ninguna operación de dashboards, pestañas, paneles, procedimientos o ejecución de paneles. Agregar pruebas para acceso asignado, empresa no asignada/inactiva y separación de datos entre empresas.

## Regla obligatoria de DTOs y contratos HTTP

1. Todos los DTOs HTTP deben ubicarse en `src/Models/`.
2. Los DTOs deben organizarse por módulo funcional, por ejemplo `src/Models/Auth`, `src/Models/Users` y `src/Models/Common`.
3. No se permite declarar DTOs HTTP dentro de Controllers, Services ni Repositories.
4. Cada endpoint debe declarar los contratos de entrada que realmente utilice.
5. Cada endpoint JSON debe declarar su `ResponseDto` y documentarlo en Swagger.
6. Los DTOs deben estar tipados estrictamente y validarse con Zod/Fastify cuando reciben entrada externa.
7. Los `ApiResponse<T>` deben usarse como envelope para todas las respuestas JSON.
8. Los DTOs no pueden exponer información sensible, secretos, hashes o tokens internos.
9. Los DTOs no deben permitir asignaciones administrativas no autorizadas.
10. Los nuevos endpoints deben cumplir esta regla desde su creación.

## Instalación

1. `npm ci` para instalar las dependencias exactas del lockfile, incluida la dependencia de desarrollo `tsx`.
2. Copiar `.env.example` a `.env.dev` y configurar los valores requeridos; establecer `JWT_SECRET` aleatorio de al menos 32 bytes y las credenciales de MySQL. No usar los valores `CHANGE_ME` del ejemplo.
3. Ejecutar `mysql -u root -p < database/001_schema_and_procedures.sql` en una base de pruebas. **La migración está pensada para instalación nueva**, no aplicarla sobre una base existente sin revisión.
4. Crear usuario MySQL para API y otorgar permisos de ejecución de los procedimientos necesarios (verificar política de privilegios del despliegue). Configurar `MYSQL_USER` y `MYSQL_PASSWORD`. Configurar `MYSQL_SSL=true` para conexiones a MySQL por redes no confiables.
5. En una instalación existente, después de que existan `users` y `companies`, ejecutar `mysql -u root -p kindmetrics < DataBaseScripts/user-company-access.sql`. El script crea la relación usuario–empresa (clave compuesta para permitir varias empresas por usuario) y recrea `sp_user_company_access_users`, `sp_user_company_access_companies` y `sp_user_company_access_replace`. Requiere MySQL 8.0 o posterior por el uso de `JSON_TABLE`; la asignación del conjunto completo de empresas se valida y actualiza en una transacción.
6. Ejecutar `mysql -u root -p kindmetrics < DataBaseScripts/company-management.sql` para agregar los campos de conexión de empresas a instalaciones existentes.
7. Para habilitar el CRUD administrativo de empresas y usuarios, aplicar en este orden los scripts que falten: `0000-users-schema.sql`, `0001-company-database-connection.sql`, `user-company-access.sql`, `0002-users-companies-kind-erick-v2.sql` y `0010-management-stored-procedures.sql`. En instalaciones existentes, aplicar `0011-company-provisioning-procedure.sql` después de `0010` y antes de usar el endpoint de aprovisionamiento. Si el endpoint detecta el procedimiento anterior que activa la empresa inmediatamente, la deja inactiva y responde `COMPANY_PROCEDURE_MIGRATION_REQUIRED`; aplica `0011` y reintenta con las mismas credenciales. Los scripts definen `sp_company_management_provision_database` con `DEFINER='kindmetrics'@'%'` y `SQL SECURITY DEFINER`; los demás procedimientos administrativos usan `SQL SECURITY INVOKER`. La cuenta `kindmetrics@'%'` debe tener privilegios para crear bases y usuarios y conceder privilegios. El registro y el aprovisionamiento son operaciones separadas:
   - `POST /api/v1/companies/management` registra una empresa en el catálogo, recibe `name`, `code`, `razon_social`, `rfc`, `direccion` y `telefono`, y la deja inactiva hasta aprovisionar la base.
   - `POST /api/v1/companies/management/{id}/database` recibe `database_name`, `database_user` y `database_password`, crea la base y el usuario MySQL, instala el esquema y los procedimientos de Dashboards, Tabs, Panels y catálogo de procedimientos en la nueva base usando las credenciales de ese usuario, y activa la empresa solo al completar todos los pasos. Devuelve los datos de la empresa registrada sin credenciales. Si falla la instalación, la empresa permanece inactiva y se puede reintentar el mismo endpoint con el mismo nombre de base, usuario y contraseña.

   `sp_company_management_provision_database` corre con los privilegios globales de `kindmetrics@'%'`. Un administrador debe conceder esos permisos una vez:

   ```sql
   GRANT ALL PRIVILEGES ON *.*
   TO 'kindmetrics'@'%'
   WITH GRANT OPTION;
   ```

   Este `GRANT` debe ejecutarse por una cuenta con autoridad administrativa. Es de alto riesgo: permite a `kindmetrics` administrar todas las bases del servidor y conceder privilegios a otras cuentas; no se recomienda en servidores compartidos. El usuario nuevo de cada empresa no accede a `kindmetrics`: solo se conecta a su propia base para ejecutar las migraciones. Los scripts `0001-dashboards-schema.sql` a `0009-dashboard-duplication-procedure-links.sql` se leen desde `DataBaseScripts` del despliegue y se aplican secuencialmente con `DELIMITER` procesado por la API.

   El procedimiento crea la base, concede primero todos los privilegios de esa base a `MYSQL_USER@'%'`, crea después el usuario enviado por el formulario y le concede todos los privilegios de esa misma base. La cuenta de aplicación debe existir con ese host. Si la base o el usuario ya existen sin corresponder a un aprovisionamiento pendiente de la misma empresa, el aprovisionamiento falla. El host `%` permite iniciar sesión desde cualquier host que alcance MySQL, por lo que también se deben restringir las conexiones con firewall/red. Configura `DB_COMPANY_SSL=true` cuando la conexión a la base tenant viaje por una red no confiable; para la conexión administrativa de la API usa `MYSQL_SSL=true`.

8. Configurar `COMPANY_DB_ENCRYPTION_KEY` con una clave Base64 válida de 32 bytes. Generar una clave nueva por entorno y no almacenarla en el repositorio. La API cifra `database_password` con AES-256-GCM y nunca devuelve la contraseña ni su valor cifrado.
9. Para crear el primer administrador global: configurar `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` en el entorno, ejecutar `npm run bootstrap:admin`, y eliminar esas variables inmediatamente después.
10. `npm run dev`; Swagger: `http://localhost:3001/docs`. En desarrollo, CORS admite frontends servidos desde `localhost`, `127.0.0.1` o `::1` en cualquier puerto; en QA/producción configura `CORS_ORIGIN` con los orígenes permitidos separados por comas. El servidor HTTP permanece disponible aunque MySQL no responda; las rutas que usan la base de datos devolverán `503 DATABASE_UNAVAILABLE` hasta restablecer la conexión. `/health` comprueba que la API responde, no la disponibilidad de MySQL.
11. `npm run check` para lint, TypeScript y pruebas.

### Recuperación de contraseña

En una base existente que ya contiene la tabla `users`, aplicar la migración
`DataBaseScripts/0012-password-recovery.sql` en la base indicada por
`MYSQL_DATABASE` antes de usar la recuperación:

```sh
mysql -u root -p KindMetrics_Erick < DataBaseScripts/0012-password-recovery.sql
```

Sustituye `KindMetrics_Erick` por el valor de `MYSQL_DATABASE` del entorno. La
migración crea `password_recovery_tokens` y los procedimientos
`sp_password_recovery_request`, `sp_password_recovery_validate` y
`sp_password_recovery_reset`; no elimina usuarios existentes. En todos los
entornos, incluida la ejecución local, la recuperación requiere que Gmail envíe
el OTP; nunca se devuelve un código de depuración. Para enviar por Gmail SMTP,
configura `MAIL_HOST=smtp.gmail.com`,
`MAIL_PORT=465`, `MAIL_SECURE=true`, `MAIL_USER` y `MAIL_PASS` en el archivo
del entorno que ejecuta la API. `npm run dev` carga `.env.dev`; `NODE_ENV=qa`
carga `.env.qa`; y `NODE_ENV=prod` carga `.env.prod`. Copia las variables
`MAIL_*` de `.env.example` al archivo correcto y sustituye los valores de
ejemplo. `MAIL_USER` debe ser la cuenta Gmail completa que enviará el correo.
`MAIL_PASS` debe ser una contraseña de aplicación de Google de esa misma cuenta,
no la contraseña normal de Gmail. Para generarla, activa la verificación en dos
pasos en la cuenta Google y crea una contraseña de aplicación; Google puede no
mostrar esa opción en cuentas administradas por una organización o con ciertas
políticas de seguridad. Guarda el secreto solo en el archivo de entorno local o
en el gestor de secretos del servidor; no lo compartas ni lo subas al
repositorio. El archivo `.env.dev` está ignorado por Git.
El correo que el usuario escribe en el portal es el destinatario; no configura
la cuenta Gmail emisora. El remitente se configura por separado en `MAIL_USER`.
Configura `APP_BASE_URL` con el origen público de KindMetrics (por ejemplo,
`https://kindmetrics.example.com`) para construir el enlace seguro enviado por
correo. En desarrollo se usa `http://localhost:9000` si no se configura.

Gmail admite `465` con TLS implícito (`MAIL_SECURE=true`) o `587` con STARTTLS
(`MAIL_SECURE=false`); la configuración por defecto del proyecto usa `465`.
`MAIL_FROM` es opcional y por defecto se usa `MAIL_USER` como remitente. Si se
define, debe ser la misma cuenta o un alias verificado en Gmail. El correo
incluye el OTP y un botón para volver a la página de recuperación de
KindMetrics; ahí se valida el código y se cambia la contraseña. Si Gmail no
está configurado o rechaza la autenticación, el remitente o la conexión SMTP,
la API responde con un error específico y el log registra el
código de error SMTP sin incluir la contraseña. Se puede volver a ejecutar para recrear los
procedimientos actualizados; la tabla se conserva. El procedimiento de
restablecimiento devuelve `updated=1` solo si actualizó la contraseña con un OTP
vigente y no usado; de lo contrario, la operación no se confirma.

## Selector de empresas

`GET /api/v1/companies/available` requiere un bearer token y devuelve únicamente `id`, `name` y `code` de las empresas activas asignadas al usuario autenticado. La identidad se toma del token; no se acepta un GUID de usuario del cliente. Los administradores de plataforma obtienen todas las empresas activas, conforme a la regla ya usada al validar `x-company-code`. Dashboards, pestañas, paneles y procedimientos siguen requiriendo el código de empresa y verifican acceso en cada solicitud. La UI debe consultar este endpoint para poblar el selector en lugar del endpoint administrativo `/companies/management`.

## Estándar obligatorio de respuestas HTTP

KindMetricsAPI usa un envelope uniforme para todas las respuestas JSON administradas por el backend.

```ts
export interface ApiError {
  code: string;
  message: string;
  field?: string;
}

export interface ApiResponsePagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiResponseMeta {
  requestId: string;
  pagination?: ApiResponsePagination;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  errors: ApiError[];
  meta: ApiResponseMeta;
}
```

Reglas obligatorias:

- `success` siempre es booleano.
- `message` siempre existe y es string.
- `data` devuelve el payload o `null` para errores.
- `errors` siempre es un arreglo.
- `meta.requestId` está presente en todas las respuestas gestionadas por Fastify.
- `meta.pagination` solo aparece cuando corresponde.
- Los códigos HTTP reflejan el resultado real; no se usa 200 para errores de negocio.
- Los errores sensibles nunca se exponen al cliente: no stack traces, no SQL, no credenciales, no secretos.
- Los nombres de propiedades son camelCase.
- Cada error usa un código estable para frontend y traducción.

Ejemplo exitoso:

```json
{
  "success": true,
  "message": "Inicio de sesión exitoso.",
  "data": {
    "accessToken": "TOKEN_JWT",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": {
      "guid": "USER_GUID",
      "email": "admin@kindtech.com",
      "name": "Admin Erick"
    }
  },
  "errors": [],
  "meta": {
    "requestId": "req-123"
  }
}
```

Ejemplo de error:

```json
{
  "success": false,
  "message": "Existen errores de validación.",
  "data": null,
  "errors": [
    {
      "code": "VALIDATION_ERROR",
      "message": "El correo electrónico es obligatorio.",
      "field": "email"
    }
  ],
  "meta": {
    "requestId": "req-124"
  }
}
```

El frontend que consuma Axios debe leer `response.data.data`, no `response.data.accessToken` directamente.

## Endpoints

- `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
- CRUD genérico `GET/POST/PATCH/DELETE /api/v1/{companies,roles,catalogs,datasources,folders,dashboards,panels,settings}`. Para obtener por GUID: `GET /api/v1/:entity/:guid`.
- Dashboards, Tabs y Panels por Company: consultar y administrar `/api/v1/dashboards`, sus rutas `/tabs` y `/panels`, y guardar layout. Dashboards exponen `refreshEnabled` y `refreshIntervalSeconds` (mínimo 10; default 30); el API no agenda tareas de refresco.
- `POST /api/v1/dashboards/:dashboardGuid/tabs/:tabGuid/panels/:panelGuid/execute` ejecuta solo el procedimiento activo referenciado por el Panel y devuelve `columns`, `rows`, `rowCount`, tiempo y fecha de ejecución. No acepta nombre de procedimiento, base de datos ni credenciales del cliente.
- Catálogo interno por Company: `GET /api/v1/dashboard-procedures` sincroniza automáticamente los procedimientos existentes con prefijo `sp_dash_` cuyos parámetros sean exclusivamente `IN`, incluyendo los que no tienen parámetros. El contrato de firma debe coincidir con `information_schema`. La ejecución se realiza en transacción de solo lectura.
- Metadata de Company y rutinas de datos: `GET /api/v1/dashboard-metadata/schema`, `GET /api/v1/dashboard-metadata/procedures`, `POST /api/v1/dashboard-metadata/procedures/validate` y `POST /api/v1/dashboard-metadata/procedures/preview`. Requieren JWT, `x-company-code` y perfil Admin o Editor. El preview acepta parámetros `IN` por nombre, ordena los valores según la firma real de MySQL, obtiene los nombres y tipos de salida desde los metadatos (también si el resultado no tiene filas), persiste el esquema y devuelve `KindMetricsDataFrame` versión 1.
- `GET/POST/PATCH/DELETE /api/v1/users` (PATCH/DELETE con `/:guid`).
- `POST /api/v1/queries/execute` responde **501 intencionalmente** hasta incorporar parser SQL AST, control de datasources y gestor de secretos. El executor mysql2 se entrega como pieza de infraestructura, **no está conectado a SQL arbitrario del usuario**.

## Seguridad y multiempresa

- Header `Authorization: Bearer <JWT>` y `x-company-code: <código>` en endpoints con contexto Company.
- El código identifica la Company, pero no es credencial. El servidor verifica usuario, Company activa, membresía y permiso específico.
- Companies requiere Platform Admin y no requiere header Company.
- Las operaciones CRUD administrativas usan procedimientos parametrizados; los procedimientos de Company filtran por `company_id` resuelto en servidor.
- Los permisos se deniegan por defecto. `user_permissions` soporta ALLOW/DENY; `role_permissions` concede por rol. No hay endpoints para asignación de roles/permisos todavía.

La ejecución de Panels resuelve Dashboard, Tab, Panel y procedimiento dentro de la Company ya autorizada. Los filtros aceptados deben estar mapeados a parámetros `DASHBOARD_FILTER`; valores `STATIC` y `SYSTEM` se resuelven desde la configuración o el contexto del backend. La API aplica timeout, hasta 8 ejecuciones concurrentes por Company y límites de 5,000 filas / 2 MB por respuesta. El pool de Company se reutiliza. La cuenta MySQL desplegada debe tener privilegios mínimos y ejecutar únicamente procedimientos de lectura auditados: el catálogo y el nombre del procedimiento no prueban por sí solos que el cuerpo sea de solo lectura.

## Migraciones Dashboard

Los scripts versionados `0006-dashboard-refresh-settings.sql` a `0009-dashboard-duplication-procedure-links.sql` amplían el esquema y los Stored Procedures de Company. Las instalaciones nuevas y reintentos de inicialización aplican los scripts del proyecto en orden. En bases tenant existentes, reejecutar `0007-dashboard-procedure-catalog.sql` y `0008-dashboard-panel-procedure-link.sql` en cada base Company para permitir la sincronización de procedimientos `sp_dash_*` sin parámetros, independientemente de su modo de seguridad; comprobar primero en el catálogo administrativo que la Company apunta a la base prevista y que la conexión seleccionada corresponde a esa Company. Los scripts no incluyen nombres físicos de bases de datos y no se ejecutan automáticamente por la API. La validación funcional con MySQL requiere un ambiente autorizado; los tests locales no aplican estas migraciones.

## Alcance y limitaciones importantes

<<<<<<< Updated upstream

Este es un **andamiaje inicial**, no un producto de producción terminado. Los CRUD de entidades administrativas son básicos (name/description/config); falta modelado específico de cada dashboard, datasource, catálogo y permisos por recurso. No se implementaron refresh/logout, recuperación de contraseña, MFA, sesiones revocables, rate limiting, auditoría en cada escritura, políticas de delegación, herencia de folders, control de versiones ni cifrado de secretos. El endpoint Query está bloqueado por seguridad. Antes de producción: modelar permisos de lectura de dashboards, filtrado de campos de salida, DTOs específicos, protección anti-enumeración, paginación y controles de seguridad y transaccionalidad adicionales.
=======

Este es un **andamiaje inicial**, no un producto de producción terminado. Los CRUD de entidades administrativas son básicos (name/description/config); falta modelado específico de cada dashboard, datasource, catálogo y permisos por recurso. No se implementaron refresh/logout, recuperación de contraseña, MFA, sesiones revocables, rate limiting, auditoría en cada escritura, políticas de delegación, herencia de folders ni control de versiones. Las contraseñas de conexión de empresas sí se cifran con AES-256-GCM y no se exponen en DTOs. El endpoint Query está bloqueado por seguridad. Antes de producción: modelar permisos de lectura de dashboards, filtrado de campos de salida, DTOs específicos, protección anti-enumeración, paginación y controles de seguridad y transaccionalidad adicionales.

> > > > > > > Stashed changes

**Atención:** el CRUD genérico devuelve columnas de tablas (no credenciales de usuario, pero sí JSON config); restringir DTOs de salida antes de desplegar. No almacenar secretos en `config`. Los ejemplos no sustituyen una revisión de seguridad.

# mysql Accesos
