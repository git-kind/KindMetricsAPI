import type { FastifyInstance } from 'fastify';
import { entityCreateSchema, entityUpdateSchema, companyCreateSchema, guid } from '../Models/Common.js';
import { authenticate, resolveCompany, requirePermission } from '../Middleware/Security.js';
import { EntityService } from '../Services/EntityService.js';
import { actorId } from '../Repositories/StoredProcedures/ActorRepository.js';
import type { EntityName } from '../Repositories/StoredProcedures/EntityRepository.js';
import { buildErrorResponse, buildSuccessResponse, createError } from '../Helpers/ResponseHelper.js';
const entities: EntityName[] = ['companies','roles','catalogs','datasources','folders','dashboards','panels','settings'];
export async function entityRoutes(app: FastifyInstance) {
  for (const entity of entities) {
    const service = new EntityService(entity);
    const global = entity === 'companies';
    const base = `/${entity}`;
    const access = async (request: Parameters<typeof authenticate>[0], reply: Parameters<typeof authenticate>[1]) => {
      if (global && !request.principal?.platformAdmin) return reply.code(403).send(buildErrorResponse('Acceso denegado.', [createError('PLATFORM_ADMIN_REQUIRED', 'Se requieren permisos de administrador global.')], request.id));
    };
    const readHooks = global ? [authenticate, access] : [authenticate, resolveCompany, requirePermission(`${entity}:read:company`)];
    const writeHooks = global ? [authenticate, access] : [authenticate, resolveCompany, requirePermission(`${entity}:manage:company`)];
    const companyId = (r: Parameters<typeof authenticate>[0]) => global ? null : r.company!.id;
    app.get(base, { preHandler: readHooks, schema: { tags: [entity] } }, async (request, reply) => {
      const rows = await service.list(companyId(request));
      return reply.code(200).send(buildSuccessResponse(rows, request.id, `${entity} obtenido correctamente.`));
    });
    app.get(`${base}/:guid`, { preHandler: readHooks, schema: { tags: [entity] } }, async (request, reply) => {
      const id = guid.safeParse((request.params as { guid: string }).guid);
      if (!id.success) return reply.code(400).send(buildErrorResponse('Identificador inválido.', [createError('INVALID_GUID', 'El guid especificado no es válido.', 'guid')], request.id));
      const rows = await service.get(id.data, companyId(request));
      if (!rows[0]) return reply.code(404).send(buildErrorResponse('Recurso no encontrado.', [createError('NOT_FOUND', 'El recurso solicitado no existe.')], request.id));
      return reply.code(200).send(buildSuccessResponse(rows[0], request.id, `${entity} obtenido correctamente.`));
    });
    app.post(base, { preHandler: writeHooks, schema: { tags: [entity], body: global ? companyCreateSchema : entityCreateSchema } }, async (request, reply) => {
      const result = (global ? companyCreateSchema : entityCreateSchema).safeParse(request.body);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => createError('VALIDATION_ERROR', issue.message, issue.path.join('.')));
        return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues, request.id));
      }
      const created = (await service.create(companyId(request), result.data, await actorId(request.principal!.sub)))[0];
      return reply.code(201).send(buildSuccessResponse(created, request.id, `${entity} creado correctamente.`));
    });
    app.patch(`${base}/:guid`, { preHandler: writeHooks, schema: { tags: [entity], body: entityUpdateSchema } }, async (request, reply) => {
      const id = guid.safeParse((request.params as { guid: string }).guid);
      const body = entityUpdateSchema.safeParse(request.body);
      if (!id.success) return reply.code(400).send(buildErrorResponse('Identificador inválido.', [createError('INVALID_GUID', 'El guid especificado no es válido.', 'guid')], request.id));
      if (!body.success) {
        const issues = body.error.issues.map((issue) => createError('VALIDATION_ERROR', issue.message, issue.path.join('.')));
        return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues, request.id));
      }
      const rows = await service.update(id.data, companyId(request), body.data, await actorId(request.principal!.sub));
      if (!rows[0]) return reply.code(404).send(buildErrorResponse('Recurso no encontrado.', [createError('NOT_FOUND', 'El recurso solicitado no existe.')], request.id));
      return reply.code(200).send(buildSuccessResponse(rows[0], request.id, `${entity} actualizado correctamente.`));
    });
    app.delete(`${base}/:guid`, { preHandler: writeHooks, schema: { tags: [entity] } }, async (request, reply) => {
      const id = guid.safeParse((request.params as { guid: string }).guid);
      if (!id.success) return reply.code(400).send(buildErrorResponse('Identificador inválido.', [createError('INVALID_GUID', 'El guid especificado no es válido.', 'guid')], request.id));
      const rows = await service.delete(id.data, companyId(request), await actorId(request.principal!.sub));
      if (!rows[0]) return reply.code(404).send(buildErrorResponse('Recurso no encontrado.', [createError('NOT_FOUND', 'El recurso solicitado no existe.')], request.id));
      return reply.code(200).send(buildSuccessResponse(rows[0], request.id, `${entity} eliminado correctamente.`));
    });
  }
}
