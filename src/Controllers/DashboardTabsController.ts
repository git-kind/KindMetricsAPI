import type { FastifyReply, FastifyRequest } from 'fastify';
import { actorId } from '../Repositories/StoredProcedures/ActorRepository.js';
import { buildErrorResponse, buildSuccessResponse, createError } from '../Helpers/ResponseHelper.js';
import {
  createDashboardTabSchema,
  dashboardTabListQuerySchema,
  dashboardTabParamsSchema,
  duplicateDashboardTabSchema,
  reorderDashboardTabsSchema,
  setDashboardTabStatusSchema,
  updateDashboardTabSchema,
} from '../Models/Dashboards/DashboardTabDto.js';
import { DashboardTabsService } from '../Services/DashboardTabsService.js';

const service = new DashboardTabsService();
type TabOperation = 'list' | 'get' | 'create' | 'update' | 'duplicate' | 'reorder' | 'setDefault' | 'setStatus' | 'delete';

function issues(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  return error.issues.map((issue) => createError('VALIDATION_ERROR', issue.message, issue.path.map(String).join('.')));
}

export class DashboardTabsController {
  async handle(operation: TabOperation, request: FastifyRequest, reply: FastifyReply) {
    const params = dashboardTabParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(params.error), request.id));
    const { dashboardGuid, tabGuid } = params.data;
    const company = request.company!;
    const canManage = request.dashboardCanManage ?? false;
    if (operation === 'list') {
      const query = dashboardTabListQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(query.error), request.id));
      const data = await service.list(company, dashboardGuid, query.data.status, canManage);
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Tabs obtenidas correctamente.'));
    }
    if (operation === 'get') {
      const data = await service.get(company, dashboardGuid, tabGuid!, canManage);
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Tab obtenida correctamente.'));
    }
    const actor = await actorId(request.principal!.sub);
    if (operation === 'create') {
      const input = createDashboardTabSchema.safeParse(request.body);
      if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(input.error), request.id));
      const data = await service.create(company, dashboardGuid, input.data, actor);
      return reply.code(201).send(buildSuccessResponse(data, request.id, 'Tab creada correctamente.'));
    }
    if (operation === 'reorder') {
      const input = reorderDashboardTabsSchema.safeParse(request.body);
      if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(input.error), request.id));
      const data = await service.reorder(company, dashboardGuid, input.data, actor);
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Tabs reordenadas correctamente.'));
    }
    if (operation === 'update') {
      const input = updateDashboardTabSchema.safeParse(request.body);
      if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(input.error), request.id));
      const data = await service.update(company, dashboardGuid, tabGuid!, input.data, actor);
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Tab actualizada correctamente.'));
    }
    if (operation === 'duplicate') {
      const input = duplicateDashboardTabSchema.safeParse(request.body ?? {});
      if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(input.error), request.id));
      const data = await service.duplicate(company, dashboardGuid, tabGuid!, input.data, actor);
      return reply.code(201).send(buildSuccessResponse(data, request.id, 'Tab duplicada correctamente.'));
    }
    if (operation === 'setDefault') {
      const data = await service.setDefault(company, dashboardGuid, tabGuid!, actor);
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Tab predeterminada actualizada.'));
    }
    if (operation === 'setStatus') {
      const input = setDashboardTabStatusSchema.safeParse(request.body);
      if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues(input.error), request.id));
      const data = await service.setStatus(company, dashboardGuid, tabGuid!, input.data, actor);
      return reply.code(200).send(buildSuccessResponse(data, request.id, 'Estado de Tab actualizado.'));
    }
    await service.delete(company, dashboardGuid, tabGuid!);
    return reply.code(204).send();
  }
}

export const dashboardTabsController = new DashboardTabsController();
