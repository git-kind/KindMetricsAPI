import type { FastifyInstance } from 'fastify';
import { dashboardMetadataController } from '../Controllers/DashboardMetadataController.js';
import { authenticate, requireDashboardAdmin, resolveCompany } from '../Middleware/Security.js';
import {
  dashboardMetadataApiResponseSchema,
  dashboardProcedureDiscoveryResponseSchema,
  dashboardProcedurePreviewResponseSchema,
  dashboardProcedurePreviewSchema,
  dashboardProcedureValidationResponseSchema,
  dashboardSchemaQuerySchema,
  validateDashboardProcedureSchema,
} from '../Models/DashboardMetadata/DashboardMetadataDto.js';

const admin = [authenticate, resolveCompany, requireDashboardAdmin] as const;
const security = [{ bearerAuth: [], companyCode: [] }];
const tags = ['Dashboard Metadata'];

export async function dashboardMetadataRoutes(app: FastifyInstance) {
  app.get(
    '/dashboard-metadata/schema',
    { preHandler: [...admin], schema: { tags, security, querystring: dashboardSchemaQuerySchema, response: { 200: dashboardMetadataApiResponseSchema } } },
    (request, reply) => dashboardMetadataController.schema(request, reply),
  );
  app.get(
    '/dashboard-metadata/procedures',
    { preHandler: [...admin], schema: { tags, security, response: { 200: dashboardProcedureDiscoveryResponseSchema } } },
    (request, reply) => dashboardMetadataController.discoverProcedures(request, reply),
  );
  app.post(
    '/dashboard-metadata/procedures/validate',
    {
      preHandler: [...admin],
      schema: { tags, security, body: validateDashboardProcedureSchema, response: { 200: dashboardProcedureValidationResponseSchema } },
    },
    (request, reply) => dashboardMetadataController.validateProcedure(request, reply),
  );
  app.post(
    '/dashboard-metadata/procedures/preview',
    {
      preHandler: [...admin],
      schema: { tags, security, body: dashboardProcedurePreviewSchema, response: { 200: dashboardProcedurePreviewResponseSchema } },
    },
    (request, reply) => dashboardMetadataController.previewProcedure(request, reply),
  );
}
