import type { FastifyReply, FastifyRequest } from 'fastify';
import { buildErrorResponse, buildSuccessResponse, createError } from '../Helpers/ResponseHelper.js';
import {
  createDashboardPanelSchema,
  executeDashboardPanelSchema,
  dashboardPanelListQuerySchema,
  dashboardPanelParamsSchema,
  moveDashboardPanelSchema,
  saveDashboardPanelLayoutSchema,
  setDashboardPanelStatusSchema,
  updateDashboardPanelSchema,
} from '../Models/Dashboards/DashboardPanelDto.js';
import { DashboardPanelsService } from '../Services/DashboardPanelsService.js';
import { DashboardPanelExecutionService } from '../Services/DashboardPanelExecutionService.js';

const service = new DashboardPanelsService();
const executionService = new DashboardPanelExecutionService();
type PanelOperation = 'list' | 'get' | 'create' | 'update' | 'duplicate' | 'move' | 'setStatus' | 'delete' | 'saveLayout' | 'execute';
function issues(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  return error.issues.map((issue) => createError('VALIDATION_ERROR', issue.message, issue.path.map(String).join('.')));
}

function databaseErrorDetails(error: unknown) {
  let current = error;
  const details: {
    databaseErrorCode?: string;
    databaseErrorNumber?: number;
    databaseSqlState?: string;
    missingTable?: string;
  } = {};
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as {
      cause?: unknown;
      code?: unknown;
      errno?: unknown;
      sqlState?: unknown;
      sqlMessage?: unknown;
    };
    const hasDatabaseDetails = candidate.errno !== undefined || candidate.sqlState !== undefined;
    if (typeof candidate.code === 'string' && (!details.databaseErrorCode || hasDatabaseDetails)) {
      details.databaseErrorCode = candidate.code;
    }
    if (typeof candidate.errno === 'number') details.databaseErrorNumber = candidate.errno;
    if (typeof candidate.sqlState === 'string') details.databaseSqlState = candidate.sqlState;
    if (candidate.code === 'ER_NO_SUCH_TABLE' && typeof candidate.sqlMessage === 'string') {
      const missingTable = candidate.sqlMessage.match(/Table '([^']+)' doesn't exist/i)?.[1];
      if (missingTable) details.missingTable = missingTable;
    }
    current = candidate.cause;
  }
  return details;
}

export class DashboardPanelsController {
  async handle(operation: PanelOperation, request: FastifyRequest, reply: FastifyReply) {
    const params = dashboardPanelParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(params.error), request.id));
    const { dashboardGuid, tabGuid, panelGuid } = params.data;
    const company = request.company!;
    const canManage = request.dashboardCanManage ?? false;
    if (operation === 'list') {
      const query = dashboardPanelListQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(query.error), request.id));
      const data = await service.list(company, dashboardGuid, tabGuid, query.data, canManage);
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Paneles obtenidos correctamente.'));
    }
    if (operation === 'get') {
      const data = await service.get(company, dashboardGuid, tabGuid, panelGuid!, canManage);
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Panel obtenido correctamente.'));
    }
    if (operation === 'saveLayout') {
      const input = saveDashboardPanelLayoutSchema.safeParse(request.body);
      if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(input.error), request.id));
      const data = await service.saveLayout(company, dashboardGuid, tabGuid, input.data.panels, request.principal!.sub);
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Layout guardado correctamente.'));
    }
    if (operation === 'execute') {
      const input = executeDashboardPanelSchema.safeParse(request.body ?? {});
      if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(input.error), request.id));
      let data;
      try {
        data = await executionService.execute(
          company,
          dashboardGuid,
          tabGuid,
          panelGuid!,
          input.data.filters,
          request.principal!.sub,
          input.data.panelName ?? panelGuid!,
        );
      } catch (error) {
        const errorCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED_ERROR';
        request.log.error({
          companyGuid: company.guid,
          dashboardGuid,
          tabGuid,
          panelGuid,
          errorCode,
          ...databaseErrorDetails(error),
        }, 'Dashboard Panel execution failed');
        throw error;
      }
      request.log.info({
        companyGuid: company.guid,
        dashboardGuid,
        tabGuid,
        panelGuid,
        panelType: data.panelType,
        rowCount: data.rowCount,
        columnNames: data.columns.map((column) => column.name),
      }, 'Dashboard Panel execution succeeded');
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Panel ejecutado correctamente.'));
    }
    if (operation === 'create') {
      const input = createDashboardPanelSchema.safeParse(request.body);
      if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(input.error), request.id));
      const data = await service.create(company, dashboardGuid, tabGuid, input.data, request.principal!.sub);
      return reply.code(201).send(buildSuccessResponse(data, request.id, 'Panel creado correctamente.'));
    }
    if (operation === 'update') {
      const input = updateDashboardPanelSchema.safeParse(request.body);
      if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(input.error), request.id));
      const data = await service.update(company, dashboardGuid, tabGuid, panelGuid!, input.data, request.principal!.sub);
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Panel actualizado correctamente.'));
    }
    if (operation === 'duplicate') {
      const data = await service.duplicate(company, dashboardGuid, tabGuid, panelGuid!, request.principal!.sub);
      return reply.code(201).send(buildSuccessResponse(data, request.id, 'Panel duplicado correctamente.'));
    }
    if (operation === 'move') {
      const input = moveDashboardPanelSchema.safeParse(request.body);
      if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(input.error), request.id));
      const data = await service.move(company, dashboardGuid, tabGuid, panelGuid!, input.data, request.principal!.sub);
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Panel movido correctamente.'));
    }
    if (operation === 'setStatus') {
      const input = setDashboardPanelStatusSchema.safeParse(request.body);
      if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(input.error), request.id));
      const data = await service.setStatus(company, dashboardGuid, tabGuid, panelGuid!, input.data, request.principal!.sub);
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Estado de Panel actualizado.'));
    }
    await service.delete(company, dashboardGuid, tabGuid, panelGuid!);
    return reply.code(204).send();
  }
}

export const dashboardPanelsController = new DashboardPanelsController();
