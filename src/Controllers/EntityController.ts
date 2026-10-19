import type { FastifyInstance } from 'fastify';
import { entityCreateSchema, entityUpdateSchema, companyCreateSchema, guid } from '../Models/Common.js';
import { authenticate, resolveCompany, requirePermission } from '../Middleware/Security.js';
import { EntityService } from '../Services/EntityService.js';
import { actorId } from '../Repositories/StoredProcedures/ActorRepository.js';
import type { EntityName } from '../Repositories/StoredProcedures/EntityRepository.js';
const entities: EntityName[] = ['companies','roles','catalogs','datasources','folders','dashboards','panels','settings'];
export async function entityRoutes(app: FastifyInstance) {
  for (const entity of entities) {
    const service = new EntityService(entity);
    const global = entity === 'companies';
    const base = `/${entity}`;
    const access = async (request: Parameters<typeof authenticate>[0], reply: Parameters<typeof authenticate>[1]) => {
      if (global && !request.principal?.platformAdmin) return reply.code(403).send({ error: 'PLATFORM_ADMIN_REQUIRED' });
    };
    const readHooks = global ? [authenticate, access] : [authenticate, resolveCompany, requirePermission(`${entity}:read:company`)];
    const writeHooks = global ? [authenticate, access] : [authenticate, resolveCompany, requirePermission(`${entity}:manage:company`)];
    const companyId = (r: Parameters<typeof authenticate>[0]) => global ? null : r.company!.id;
    app.get(base, { preHandler: readHooks, schema: { tags: [entity] } }, async (request) => service.list(companyId(request)));
    app.get(`${base}/:guid`, { preHandler: readHooks, schema: { tags: [entity] } }, async (request, reply) => {
      const id = guid.safeParse((request.params as { guid: string }).guid);
      if (!id.success) return reply.code(400).send({ error: 'INVALID_GUID' });
      const rows = await service.get(id.data, companyId(request));
      return rows[0] ?? reply.code(404).send({ error: 'NOT_FOUND' });
    });
    app.post(base, { preHandler: writeHooks, schema: { tags: [entity], body: global ? companyCreateSchema : entityCreateSchema } }, async (request, reply) => {
      const result = (global ? companyCreateSchema : entityCreateSchema).safeParse(request.body);
      if (!result.success) return reply.code(400).send({ error: 'INVALID_BODY', issues: result.error.issues });
      return reply.code(201).send((await service.create(companyId(request), result.data, await actorId(request.principal!.sub)))[0]);
    });
    app.patch(`${base}/:guid`, { preHandler: writeHooks, schema: { tags: [entity], body: entityUpdateSchema } }, async (request, reply) => {
      const id = guid.safeParse((request.params as { guid: string }).guid);
      const body = entityUpdateSchema.safeParse(request.body);
      if (!id.success || !body.success) return reply.code(400).send({ error: 'INVALID_REQUEST' });
      const rows = await service.update(id.data, companyId(request), body.data, await actorId(request.principal!.sub));
      return rows[0] ?? reply.code(404).send({ error: 'NOT_FOUND' });
    });
    app.delete(`${base}/:guid`, { preHandler: writeHooks, schema: { tags: [entity] } }, async (request, reply) => {
      const id = guid.safeParse((request.params as { guid: string }).guid);
      if (!id.success) return reply.code(400).send({ error: 'INVALID_GUID' });
      const rows = await service.delete(id.data, companyId(request), await actorId(request.principal!.sub));
      return rows[0] ?? reply.code(404).send({ error: 'NOT_FOUND' });
    });
  }
}
