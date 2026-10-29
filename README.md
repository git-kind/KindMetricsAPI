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
4. Crear usuario MySQL para API y otorgar permisos de ejecución de los procedimientos necesarios (verificar política de privilegios del despliegue). Configurar `MYSQL_USER` y `MYSQL_PASSWORD`.
5. En una instalación existente, después de que existan `users` y `companies`, ejecutar `mysql -u root -p kindmetrics < DataBaseScripts/user-company-access.sql`. El script crea la relación usuario–empresa (clave compuesta para permitir varias empresas por usuario) y recrea `sp_user_company_access_users`, `sp_user_company_access_companies` y `sp_user_company_access_replace`. Requiere MySQL 8.0 o posterior por el uso de `JSON_TABLE`; la asignación del conjunto completo de empresas se valida y actualiza en una transacción.
6. Ejecutar `mysql -u root -p kindmetrics < DataBaseScripts/company-management.sql` para agregar los campos de conexión de empresas a instalaciones existentes.
7. Configurar `COMPANY_CREDENTIALS_ENCRYPTION_KEY` con exactamente 64 caracteres hexadecimales (32 bytes). Generar una clave nueva por entorno y no almacenarla en el repositorio. La API cifra `database_password` con AES-256-GCM y nunca devuelve la contraseña ni su valor cifrado.
8. Para crear el primer administrador global: configurar `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` en el entorno, ejecutar `npm run bootstrap:admin`, y eliminar esas variables inmediatamente después.
9. `npm run dev`; Swagger: `http://localhost:3001/docs`. En desarrollo, CORS admite frontends servidos desde `localhost`, `127.0.0.1` o `::1` en cualquier puerto; en QA/producción configura `CORS_ORIGIN` con los orígenes permitidos separados por comas. El servidor HTTP permanece disponible aunque MySQL no responda; las rutas que usan la base de datos devolverán `503 DATABASE_UNAVAILABLE` hasta restablecer la conexión. `/health` comprueba que la API responde, no la disponibilidad de MySQL.
10. `npm run check` para lint, TypeScript y pruebas.

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
- Catálogo Admin-only por Company: `GET/POST /api/v1/dashboard-procedures`, `GET/PATCH/DELETE /api/v1/dashboard-procedures/:guid`. Los registros nuevos quedan `PENDING`; activarlos exige revisión por otro Admin con referencia de aprobación.
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

Los scripts versionados `0006-dashboard-refresh-settings.sql` a `0009-dashboard-duplication-procedure-links.sql` amplían el esquema y los Stored Procedures de Company. Aplicarlos secuencialmente solo después de comprobar en el catálogo administrativo que la Company de destino apunta a la base prevista y que la conexión seleccionada corresponde a esa Company. Los scripts no incluyen nombres físicos de bases de datos y no se ejecutan automáticamente por la API. La validación funcional con MySQL requiere un ambiente autorizado; los tests locales no aplican estas migraciones.

## Alcance y limitaciones importantes
<<<<<<< Updated upstream

Este es un **andamiaje inicial**, no un producto de producción terminado. Los CRUD de entidades administrativas son básicos (name/description/config); falta modelado específico de cada dashboard, datasource, catálogo y permisos por recurso. No se implementaron refresh/logout, recuperación de contraseña, MFA, sesiones revocables, rate limiting, auditoría en cada escritura, políticas de delegación, herencia de folders, control de versiones ni cifrado de secretos. El endpoint Query está bloqueado por seguridad. Antes de producción: modelar permisos de lectura de dashboards, filtrado de campos de salida, DTOs específicos, protección anti-enumeración, paginación y controles de seguridad y transaccionalidad adicionales.
=======
Este es un **andamiaje inicial**, no un producto de producción terminado. Los CRUD de entidades administrativas son básicos (name/description/config); falta modelado específico de cada dashboard, datasource, catálogo y permisos por recurso. No se implementaron refresh/logout, recuperación de contraseña, MFA, sesiones revocables, rate limiting, auditoría en cada escritura, políticas de delegación, herencia de folders ni control de versiones. Las contraseñas de conexión de empresas sí se cifran con AES-256-GCM y no se exponen en DTOs. El endpoint Query está bloqueado por seguridad. Antes de producción: modelar permisos de lectura de dashboards, filtrado de campos de salida, DTOs específicos, protección anti-enumeración, paginación y controles de seguridad y transaccionalidad adicionales.
>>>>>>> Stashed changes

**Atención:** el CRUD genérico devuelve columnas de tablas (no credenciales de usuario, pero sí JSON config); restringir DTOs de salida antes de desplegar. No almacenar secretos en `config`. Los ejemplos no sustituyen una revisión de seguridad.

# mysql Accesos
