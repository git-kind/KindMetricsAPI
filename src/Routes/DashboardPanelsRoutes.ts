import type { FastifyInstance } from 'fastify';
import { dashboardPanelsController } from '../Controllers/DashboardPanelsController.js';
import {
  authenticate,
  requireKindTechDashboardAdmin,
  resolveCompany,
  resolveDashboardReadAccess,
  resolveKindTechContext,
  resolveKindTechDashboardReadAccess,
} from '../Middleware/Security.js';
import {
  createDashboardPanelSchema,
  dashboardPanelExecutionApiResponseSchema,
  dashboardPanelListQuerySchema,
  dashboardPanelGuidParamsSchema,
  dashboardPanelParamsSchema,
  dashboardPanelApiResponseSchema,
  dashboardPanelListApiResponseSchema,
  moveDashboardPanelSchema,
  saveDashboardPanelLayoutSchema,
  setDashboardPanelStatusSchema,
  updateDashboardPanelSchema,
  executeDashboardPanelSchema,
} from '../Models/Dashboards/DashboardPanelDto.js';

const centralRead = [authenticate, resolveKindTechContext, resolveKindTechDashboardReadAccess] as const;
const centralWrite = [authenticate, resolveKindTechContext, requireKindTechDashboardAdmin] as const;
const execute = [authenticate, resolveCompany, resolveDashboardReadAccess] as const;
const security = [{ bearerAuth: [] }];
const executionSecurity = [{ bearerAuth: [], companyCode: [] }];
const tags = ['Dashboard Panels'];

export async function dashboardPanelsRoutes(app: FastifyInstance) {
  app.put(
    '/dashboards/:dashboardGuid/tabs/:tabGuid/panels/layout',
    {
      preHandler: [...centralWrite],
      schema: {
        tags,
        security,
        params: dashboardPanelParamsSchema,
        body: saveDashboardPanelLayoutSchema,
        response: { 200: dashboardPanelListApiResponseSchema },
      },
    },
    (req, reply) => dashboardPanelsController.handle('saveLayout', req, reply),
  );
  app.get(
    '/dashboards/:dashboardGuid/tabs/:tabGuid/panels',
    {
      preHandler: [...centralRead],
      schema: {
        tags,
        security,
        params: dashboardPanelParamsSchema,
        querystring: dashboardPanelListQuerySchema,
        response: { 200: dashboardPanelListApiResponseSchema },
      },
    },
    (req, reply) => dashboardPanelsController.handle('list', req, reply),
  );
  app.get(
    '/dashboards/:dashboardGuid/tabs/:tabGuid/panels/:panelGuid',
    { preHandler: [...centralRead], schema: { tags, security, params: dashboardPanelGuidParamsSchema, response: { 200: dashboardPanelApiResponseSchema } } },
    (req, reply) => dashboardPanelsController.handle('get', req, reply),
  );
  app.post(
    '/dashboards/:dashboardGuid/tabs/:tabGuid/panels/:panelGuid/execute',
    {
      preHandler: [...execute],
      schema: {
        tags,
        security: executionSecurity,
        params: dashboardPanelGuidParamsSchema,
        body: executeDashboardPanelSchema,
        response: { 200: dashboardPanelExecutionApiResponseSchema },
      },
    },
    (req, reply) => dashboardPanelsController.handle('execute', req, reply),
  );
  app.post(
    '/dashboards/:dashboardGuid/tabs/:tabGuid/panels',
    {
      preHandler: [...centralWrite],
      schema: { tags, security, params: dashboardPanelParamsSchema, body: createDashboardPanelSchema, response: { 201: dashboardPanelApiResponseSchema } },
    },
    (req, reply) => dashboardPanelsController.handle('create', req, reply),
  );
  app.patch(
    '/dashboards/:dashboardGuid/tabs/:tabGuid/panels/:panelGuid',
    {
      preHandler: [...centralWrite],
      schema: { tags, security, params: dashboardPanelGuidParamsSchema, body: updateDashboardPanelSchema, response: { 200: dashboardPanelApiResponseSchema } },
    },
    (req, reply) => dashboardPanelsController.handle('update', req, reply),
  );
  app.delete(
    '/dashboards/:dashboardGuid/tabs/:tabGuid/panels/:panelGuid',
    { preHandler: [...centralWrite], schema: { tags, security, params: dashboardPanelGuidParamsSchema } },
    (req, reply) => dashboardPanelsController.handle('delete', req, reply),
  );
  app.post(
    '/dashboards/:dashboardGuid/tabs/:tabGuid/panels/:panelGuid/duplicate',
    { preHandler: [...centralWrite], schema: { tags, security, params: dashboardPanelGuidParamsSchema, response: { 201: dashboardPanelApiResponseSchema } } },
    (req, reply) => dashboardPanelsController.handle('duplicate', req, reply),
  );
  app.patch(
    '/dashboards/:dashboardGuid/tabs/:tabGuid/panels/:panelGuid/move',
    {
      preHandler: [...centralWrite],
      schema: { tags, security, params: dashboardPanelGuidParamsSchema, body: moveDashboardPanelSchema, response: { 200: dashboardPanelApiResponseSchema } },
    },
    (req, reply) => dashboardPanelsController.handle('move', req, reply),
  );
  app.patch(
    '/dashboards/:dashboardGuid/tabs/:tabGuid/panels/:panelGuid/status',
    {
      preHandler: [...execute],
      schema: {
        tags,
        security,
        params: dashboardPanelGuidParamsSchema,
        body: setDashboardPanelStatusSchema,
        response: { 200: dashboardPanelApiResponseSchema },
      },
    },
    (req, reply) => dashboardPanelsController.handle('setStatus', req, reply),
  );
}
