import type { FastifyReply, FastifyRequest } from 'fastify';
import { actorId } from '../Repositories/StoredProcedures/ActorRepository.js';
import { buildErrorResponse, buildSuccessResponse, createError } from '../Helpers/ResponseHelper.js';
import {
  createDashboardPanelSchema,
  dashboardPanelListQuerySchema,
  dashboardPanelParamsSchema,
  moveDashboardPanelSchema,
  saveDashboardPanelLayoutSchema,
  setDashboardPanelStatusSchema,
  updateDashboardPanelSchema,
} from '../Models/Dashboards/DashboardPanelDto.js';
import { DashboardPanelsService } from '../Services/DashboardPanelsService.js';

const service = new DashboardPanelsService();
type PanelOperation = 'list' | 'get' | 'create' | 'update' | 'duplicate' | 'move' | 'setStatus' | 'delete' | 'saveLayout';
function issues(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  return error.issues.map((issue) => createError('VALIDATION_ERROR', issue.message, issue.path.map(String).join('.')));
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
      const data = await service.saveLayout(company, dashboardGuid, tabGuid, input.data.panels, await actorId(request.principal!.sub));
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Layout guardado correctamente.'));
    }
    const actor = await actorId(request.principal!.sub);
    if (operation === 'create') {
      const input = createDashboardPanelSchema.safeParse(request.body);
      if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(input.error), request.id));
      const data = await service.create(company, dashboardGuid, tabGuid, input.data, actor);
      return reply.code(201).send(buildSuccessResponse(data, request.id, 'Panel creado correctamente.'));
    }
    if (operation === 'update') {
      const input = updateDashboardPanelSchema.safeParse(request.body);
      if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(input.error), request.id));
      const data = await service.update(company, dashboardGuid, tabGuid, panelGuid!, input.data, actor);
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Panel actualizado correctamente.'));
    }
    if (operation === 'duplicate') {
      const data = await service.duplicate(company, dashboardGuid, tabGuid, panelGuid!, actor);
      return reply.code(201).send(buildSuccessResponse(data, request.id, 'Panel duplicado correctamente.'));
    }
    if (operation === 'move') {
      const input = moveDashboardPanelSchema.safeParse(request.body);
      if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(input.error), request.id));
      const data = await service.move(company, dashboardGuid, tabGuid, panelGuid!, input.data, actor);
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Panel movido correctamente.'));
    }
    if (operation === 'setStatus') {
      const input = setDashboardPanelStatusSchema.safeParse(request.body);
      if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(input.error), request.id));
      const data = await service.setStatus(company, dashboardGuid, tabGuid, panelGuid!, input.data, actor);
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Estado de Panel actualizado.'));
    }
    await service.delete(company, dashboardGuid, tabGuid, panelGuid!);
    return reply.code(204).send();
  }
}

export const dashboardPanelsController = new DashboardPanelsController();
