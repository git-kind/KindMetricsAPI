import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dashboardsController } from '../Controllers/DashboardsController.js';
import { authenticate, requireDashboardAdmin, resolveCompany, resolveDashboardReadAccess } from '../Middleware/Security.js';
import {
  createDashboardSchema,
  dashboardApiResponseSchema,
  dashboardFiltersSchema,
  dashboardGuidParamsSchema,
  dashboardListApiResponseSchema,
  dashboardStatusRequestSchema,
  duplicateDashboardSchema,
  updateDashboardSchema,
} from '../Models/Dashboards/DashboardDto.js';

const readHooks = [authenticate, resolveCompany, resolveDashboardReadAccess] as const;
const writeHooks = [authenticate, resolveCompany, requireDashboardAdmin] as const;
const security = [{ bearerAuth: [], companyCode: [] }];
const tags = ['Dashboards'];

export async function dashboardRoutes(app: FastifyInstance) {
  app.get(
    '/dashboards',
    {
      preHandler: [...readHooks],
      schema: {
        tags,
        security,
        querystring: dashboardFiltersSchema,
        response: { 200: dashboardListApiResponseSchema },
      },
    },
    (request, reply) => dashboardsController.list(request, reply),
  );

  app.get(
    '/dashboards/:guid',
    {
      preHandler: [...readHooks],
      schema: {
        tags,
        security,
        params: dashboardGuidParamsSchema,
        response: { 200: dashboardApiResponseSchema },
      },
    },
    (request, reply) => dashboardsController.get(request, reply),
  );

  app.post(
    '/dashboards',
    {
      preHandler: [...writeHooks],
      schema: {
        tags,
        security,
        body: createDashboardSchema,
        response: { 201: dashboardApiResponseSchema },
      },
    },
    (request, reply) => dashboardsController.create(request, reply),
  );

  app.patch(
    '/dashboards/:guid',
    {
      preHandler: [...writeHooks],
      schema: {
        tags,
        security,
        params: dashboardGuidParamsSchema,
        body: updateDashboardSchema,
        response: { 200: dashboardApiResponseSchema },
      },
    },
    (request, reply) => dashboardsController.update(request, reply),
  );

  app.post(
    '/dashboards/:guid/duplicate',
    {
      preHandler: [...writeHooks],
      schema: {
        tags,
        security,
        params: dashboardGuidParamsSchema,
        body: duplicateDashboardSchema,
        response: { 201: dashboardApiResponseSchema },
      },
    },
    (request, reply) => dashboardsController.duplicate(request, reply),
  );

  app.patch(
    '/dashboards/:guid/status',
    {
      preHandler: [...writeHooks],
      schema: {
        tags,
        security,
        params: dashboardGuidParamsSchema,
        body: dashboardStatusRequestSchema,
        response: { 200: dashboardApiResponseSchema },
      },
    },
    (request, reply) => dashboardsController.setStatus(request, reply),
  );

  app.delete(
    '/dashboards/:guid',
    {
      preHandler: [...writeHooks],
      schema: {
        tags,
        security,
        params: dashboardGuidParamsSchema,
        response: { 204: z.null() },
      },
    },
    (request, reply) => dashboardsController.delete(request, reply),
  );
}
