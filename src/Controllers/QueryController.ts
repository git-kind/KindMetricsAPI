import type { FastifyInstance } from 'fastify';
import { querySchema } from '../Models/Common.js';
import { authenticate, resolveCompany, requirePermission } from '../Middleware/Security.js';
import { QueryService } from '../Services/QueryService.js';
import { buildErrorResponse, buildSuccessResponse, createError } from '../Helpers/ResponseHelper.js';
const service = new QueryService();
export async function queryRoutes(app: FastifyInstance) {
  app.post('/queries/execute', { preHandler: [authenticate, resolveCompany, requirePermission('datasource:query:company')], schema: { tags: ['Queries'], body: querySchema } }, async (request, reply) => {
    const result = querySchema.safeParse(request.body);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => createError('VALIDATION_ERROR', issue.message, issue.path.join('.')));
      return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues, request.id));
    }
    try {
      const data = await service.execute(request.company!.id, result.data.datasourceGuid, result.data.sql, result.data.params, result.data.maxRows);
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Consulta ejecutada correctamente.'));
    }
    catch {
      return reply.code(501).send(buildErrorResponse('Motor de consultas no configurado.', [createError('QUERY_ENGINE_NOT_CONFIGURED', 'SQL parser, datasource secret management and isolation must be configured first.')], request.id));
    }
  });
}
