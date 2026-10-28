import type { FastifyInstance } from 'fastify';
import { dashboardTabsController } from '../Controllers/DashboardTabsController.js';
import { authenticate, requireDashboardAdmin, resolveCompany, resolveDashboardReadAccess } from '../Middleware/Security.js';
import {
  createDashboardTabSchema,
  dashboardTabListQuerySchema,
  dashboardTabGuidParamsSchema,
  dashboardTabApiResponseSchema,
  dashboardTabListApiResponseSchema,
  duplicateDashboardTabSchema,
  reorderDashboardTabsSchema,
  setDashboardTabStatusSchema,
  updateDashboardTabSchema,
} from '../Models/Dashboards/DashboardTabDto.js';

const read = [authenticate, resolveCompany, resolveDashboardReadAccess] as const;
const write = [authenticate, resolveCompany, requireDashboardAdmin] as const;
const security = [{ bearerAuth: [], companyCode: [] }];
const tags = ['Dashboard Tabs'];

export async function dashboardTabsRoutes(app: FastifyInstance) {
  app.patch(
    '/dashboards/:dashboardGuid/tabs/reorder',
    {
      preHandler: [...write],
      schema: {
        tags,
        security,
        body: reorderDashboardTabsSchema,
        response: { 200: dashboardTabListApiResponseSchema },
      },
    },
    (req, reply) => dashboardTabsController.handle('reorder', req, reply),
  );
  app.get(
    '/dashboards/:dashboardGuid/tabs',
    { preHandler: [...read], schema: { tags, security, querystring: dashboardTabListQuerySchema, response: { 200: dashboardTabListApiResponseSchema } } },
    (req, reply) => dashboardTabsController.handle('list', req, reply),
  );
  app.get(
    '/dashboards/:dashboardGuid/tabs/:tabGuid',
    { preHandler: [...read], schema: { tags, security, params: dashboardTabGuidParamsSchema, response: { 200: dashboardTabApiResponseSchema } } },
    (req, reply) => dashboardTabsController.handle('get', req, reply),
  );
  app.post(
    '/dashboards/:dashboardGuid/tabs',
    { preHandler: [...write], schema: { tags, security, body: createDashboardTabSchema, response: { 201: dashboardTabApiResponseSchema } } },
    (req, reply) => dashboardTabsController.handle('create', req, reply),
  );
  app.patch(
    '/dashboards/:dashboardGuid/tabs/:tabGuid',
    {
      preHandler: [...write],
      schema: { tags, security, params: dashboardTabGuidParamsSchema, body: updateDashboardTabSchema, response: { 200: dashboardTabApiResponseSchema } },
    },
    (req, reply) => dashboardTabsController.handle('update', req, reply),
  );
  app.delete(
    '/dashboards/:dashboardGuid/tabs/:tabGuid',
    { preHandler: [...write], schema: { tags, security, params: dashboardTabGuidParamsSchema } },
    (req, reply) => dashboardTabsController.handle('delete', req, reply),
  );
  app.post(
    '/dashboards/:dashboardGuid/tabs/:tabGuid/duplicate',
    {
      preHandler: [...write],
      schema: { tags, security, params: dashboardTabGuidParamsSchema, body: duplicateDashboardTabSchema, response: { 201: dashboardTabApiResponseSchema } },
    },
    (req, reply) => dashboardTabsController.handle('duplicate', req, reply),
  );
  app.patch(
    '/dashboards/:dashboardGuid/tabs/:tabGuid/default',
    { preHandler: [...write], schema: { tags, security, params: dashboardTabGuidParamsSchema, response: { 200: dashboardTabApiResponseSchema } } },
    (req, reply) => dashboardTabsController.handle('setDefault', req, reply),
  );
  app.patch(
    '/dashboards/:dashboardGuid/tabs/:tabGuid/status',
    {
      preHandler: [...write],
      schema: { tags, security, params: dashboardTabGuidParamsSchema, body: setDashboardTabStatusSchema, response: { 200: dashboardTabApiResponseSchema } },
    },
    (req, reply) => dashboardTabsController.handle('setStatus', req, reply),
  );
}
