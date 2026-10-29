import type { FastifyInstance } from 'fastify';
import { dashboardProceduresController } from '../Controllers/DashboardProceduresController.js';
import { authenticate, requireDashboardAdmin, resolveCompany } from '../Middleware/Security.js';
import {
  createDashboardProcedureSchema,
  dashboardProcedureApiResponseSchema,
  dashboardProcedureGuidParamsSchema,
  dashboardProcedureListApiResponseSchema,
  updateDashboardProcedureSchema,
} from '../Models/DashboardProcedures/DashboardProcedureDto.js';

const admin = [authenticate, resolveCompany, requireDashboardAdmin] as const;
const security = [{ bearerAuth: [], companyCode: [] }];
const tags = ['Dashboard Procedures'];

export async function dashboardProceduresRoutes(app: FastifyInstance) {
  app.get(
    '/dashboard-procedures',
    { preHandler: [...admin], schema: { tags, security, response: { 200: dashboardProcedureListApiResponseSchema } } },
    (request, reply) => dashboardProceduresController.list(request, reply),
  );
  app.get(
    '/dashboard-procedures/:guid',
    {
      preHandler: [...admin],
      schema: { tags, security, params: dashboardProcedureGuidParamsSchema, response: { 200: dashboardProcedureApiResponseSchema } },
    },
    (request, reply) => dashboardProceduresController.get(request, reply),
  );
  app.post(
    '/dashboard-procedures',
    {
      preHandler: [...admin],
      schema: { tags, security, body: createDashboardProcedureSchema, response: { 201: dashboardProcedureApiResponseSchema } },
    },
    (request, reply) => dashboardProceduresController.create(request, reply),
  );
  app.patch(
    '/dashboard-procedures/:guid',
    {
      preHandler: [...admin],
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
    { preHandler: [...admin], schema: { tags, security, params: dashboardProcedureGuidParamsSchema } },
    (request, reply) => dashboardProceduresController.delete(request, reply),
  );
}