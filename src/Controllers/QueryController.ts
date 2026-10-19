import type { FastifyInstance } from 'fastify';
import { querySchema } from '../Models/Common.js';
import { authenticate, resolveCompany, requirePermission } from '../Middleware/Security.js';
import { QueryService } from '../Services/QueryService.js';
const service = new QueryService();
export async function queryRoutes(app: FastifyInstance) {
  app.post('/queries/execute', { preHandler: [authenticate, resolveCompany, requirePermission('datasource:query:company')], schema: { tags: ['Queries'], body: querySchema } }, async (request, reply) => {
    const result = querySchema.safeParse(request.body);
    if (!result.success) return reply.code(400).send({ error: 'INVALID_BODY', issues: result.error.issues });
    try { return await service.execute(request.company!.id, result.data.datasourceGuid, result.data.sql, result.data.params, result.data.maxRows); }
    catch { return reply.code(501).send({ error: 'QUERY_ENGINE_NOT_CONFIGURED', message: 'SQL parser, datasource secret management and isolation must be configured first.' }); }
  });
}
