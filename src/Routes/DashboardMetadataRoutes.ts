import type { FastifyInstance } from 'fastify';
import { dashboardMetadataController } from '../Controllers/DashboardMetadataController.js';
import {
  authenticate,
  requireKindTechDashboardAdmin,
  resolveKindTechContext,
  resolveKindTechDashboardReadAccess,
} from '../Middleware/Security.js';
import {
  dashboardMetadataApiResponseSchema,
  dashboardProcedureDiscoveryResponseSchema,
  dashboardProcedurePreviewResponseSchema,
  dashboardProcedurePreviewSchema,
  dashboardProcedureValidationResponseSchema,
  dashboardSchemaQuerySchema,
  validateDashboardProcedureSchema,
} from '../Models/DashboardMetadata/DashboardMetadataDto.js';

const read = [authenticate, resolveKindTechContext, resolveKindTechDashboardReadAccess] as const;
const write = [authenticate, resolveKindTechContext, requireKindTechDashboardAdmin] as const;
const security = [{ bearerAuth: [] }];
const tags = ['Dashboard Metadata'];

export async function dashboardMetadataRoutes(app: FastifyInstance) {
  app.get(
    '/dashboard-metadata/schema',
    { preHandler: [...read], schema: { tags, security, querystring: dashboardSchemaQuerySchema, response: { 200: dashboardMetadataApiResponseSchema } } },
    (request, reply) => dashboardMetadataController.schema(request, reply),
  );
  app.get(
    '/dashboard-metadata/procedures',
    { preHandler: [...read], schema: { tags, security, response: { 200: dashboardProcedureDiscoveryResponseSchema } } },
    (request, reply) => dashboardMetadataController.discoverProcedures(request, reply),
  );
  app.post(
    '/dashboard-metadata/procedures/validate',
    {
      preHandler: [...read],
      schema: { tags, security, body: validateDashboardProcedureSchema, response: { 200: dashboardProcedureValidationResponseSchema } },
    },
    (request, reply) => dashboardMetadataController.validateProcedure(request, reply),
  );
  app.post(
    '/dashboard-metadata/procedures/preview',
    {
      preHandler: [...write],
      schema: { tags, security, body: dashboardProcedurePreviewSchema, response: { 200: dashboardProcedurePreviewResponseSchema } },
    },
    (request, reply) => dashboardMetadataController.previewProcedure(request, reply),
  );
}
