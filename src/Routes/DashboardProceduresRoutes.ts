import type { FastifyInstance } from 'fastify';
import { dashboardProceduresController } from '../Controllers/DashboardProceduresController.js';
import {
  authenticate,
  requireKindTechDashboardAdmin,
  resolveKindTechContext,
  resolveKindTechDashboardReadAccess,
} from '../Middleware/Security.js';
import {
  createDashboardProcedureSchema,
  dashboardProcedureApiResponseSchema,
  dashboardProcedureGuidParamsSchema,
  dashboardProcedureListApiResponseSchema,
  updateDashboardProcedureSchema,
} from '../Models/DashboardProcedures/DashboardProcedureDto.js';

const read = [authenticate, resolveKindTechContext, resolveKindTechDashboardReadAccess] as const;
const write = [authenticate, resolveKindTechContext, requireKindTechDashboardAdmin] as const;
const security = [{ bearerAuth: [] }];
const tags = ['Dashboard Procedures'];

export async function dashboardProceduresRoutes(app: FastifyInstance) {
  app.get(
    '/dashboard-procedures',
    { preHandler: [...read], schema: { tags, security, response: { 200: dashboardProcedureListApiResponseSchema } } },
    (request, reply) => dashboardProceduresController.list(request, reply),
  );
  app.get(
    '/dashboard-procedures/:guid',
    {
      preHandler: [...read],
      schema: { tags, security, params: dashboardProcedureGuidParamsSchema, response: { 200: dashboardProcedureApiResponseSchema } },
    },
    (request, reply) => dashboardProceduresController.get(request, reply),
  );
  app.post(
    '/dashboard-procedures',
    {
      preHandler: [...write],
      schema: { tags, security, body: createDashboardProcedureSchema, response: { 201: dashboardProcedureApiResponseSchema } },
    },
    (request, reply) => dashboardProceduresController.create(request, reply),
  );
  app.patch(
    '/dashboard-procedures/:guid',
    {
      preHandler: [...write],
      schema: {
        tags,
        security,
        params: dashboardProcedureGuidParamsSchema,
        body: updateDashboardProcedureSchema,
        response: { 200: dashboardProcedureApiResponseSchema },
      },
    },
    (request, reply) => dashboardProceduresController.update(request, reply),
  );
  app.delete(
    '/dashboard-procedures/:guid',
    { preHandler: [...write], schema: { tags, security, params: dashboardProcedureGuidParamsSchema } },
    (request, reply) => dashboardProceduresController.delete(request, reply),
  );
}