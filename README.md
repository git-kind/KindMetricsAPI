# KindMetricsAPI — proyecto base (v0.1.0)

## Arquitectura acordada
Node.js + TypeScript + Fastify; **Controllers / Models (DTOs) / Services / Repositories**. Dos implementaciones físicas: `Repositories/StoredProcedures` para CRUD administrativo mediante `CALL`, y `Repositories/Queries` para SELECT del editor. Swagger en `/docs` y OpenAPI en `/docs/json`. ESLint, Prettier, TypeScript strict y pruebas.

## Instalación
1. `npm install`
2. Crear `.env` desde `.env.example` y configurar credenciales y `JWT_SECRET` seguro.
3. Ejecutar `mysql -u root -p < database/001_schema_and_procedures.sql` en una base de pruebas. **La migración está pensada para instalación nueva**, no aplicarla sobre una base existente sin revisión.
4. Crear usuario MySQL para API y otorgar permisos de ejecución de los procedimientos necesarios (verificar política de privilegios del despliegue). Configurar `MYSQL_USER` y `MYSQL_PASSWORD`.
5. Para crear el primer administrador global: configurar `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` en el entorno, ejecutar `npm run bootstrap:admin`, y eliminar esas variables inmediatamente después.
6. `npm run dev`; Swagger: `http://localhost:3001/docs`.
7. `npm run check` para lint, TypeScript y pruebas.

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
- `POST /api/v1/auth/login`, `GET /api/v1/auth/me`
- CRUD genérico `GET/POST/PATCH/DELETE /api/v1/{companies,roles,catalogs,datasources,folders,dashboards,panels,settings}`. Para obtener por GUID: `GET /api/v1/:entity/:guid`.
- `GET/POST/PATCH/DELETE /api/v1/users` (PATCH/DELETE con `/:guid`).
- `POST /api/v1/queries/execute` responde **501 intencionalmente** hasta incorporar parser SQL AST, control de datasources y gestor de secretos. El executor mysql2 se entrega como pieza de infraestructura, **no está conectado a SQL arbitrario del usuario**.

## Seguridad y multiempresa
- Header `Authorization: Bearer <JWT>` y `X-Company-Guid: <UUID>` en endpoints con contexto Company.
- El GUID **no es credencial**. El servidor verifica usuario, Company activa, membresía y permiso específico.
- Companies requiere Platform Admin y no requiere header Company.
- Las operaciones CRUD administrativas usan procedimientos parametrizados; los procedimientos de Company filtran por `company_id` resuelto en servidor.
- Los permisos se deniegan por defecto. `user_permissions` soporta ALLOW/DENY; `role_permissions` concede por rol. No hay endpoints para asignación de roles/permisos todavía.

## Alcance y limitaciones importantes
Este es un **andamiaje inicial**, no un producto de producción terminado. Los CRUD de entidades administrativas son básicos (name/description/config); falta modelado específico de cada dashboard, datasource, catálogo y permisos por recurso. No se implementaron refresh/logout, recuperación de contraseña, MFA, sesiones revocables, rate limiting, auditoría en cada escritura, políticas de delegación, herencia de folders, control de versiones ni cifrado de secretos. El endpoint Query está bloqueado por seguridad. Antes de producción: modelar permisos de lectura de dashboards, filtrado de campos de salida, DTOs específicos, protección anti-enumeración, paginación y controles de seguridad y transaccionalidad adicionales.

**Atención:** el CRUD genérico devuelve columnas de tablas (no credenciales de usuario, pero sí JSON config); restringir DTOs de salida antes de desplegar. No almacenar secretos en `config`. Los ejemplos no sustituyen una revisión de seguridad.


# mysql Accesos
