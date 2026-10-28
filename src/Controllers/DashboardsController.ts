import type { FastifyReply, FastifyRequest } from 'fastify';
import { actorId } from '../Repositories/StoredProcedures/ActorRepository.js';
import {
  createDashboardSchema,
  dashboardFiltersSchema,
  dashboardGuidParamsSchema,
  dashboardStatusRequestSchema,
  duplicateDashboardSchema,
  updateDashboardSchema,
} from '../Models/Dashboards/DashboardDto.js';
import { buildErrorResponse, buildPagination, buildSuccessResponse, createError } from '../Helpers/ResponseHelper.js';
import { DashboardsService } from '../Services/DashboardsService.js';

const service = new DashboardsService();

function validationErrors(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  return error.issues.map((issue) => createError('VALIDATION_ERROR', issue.message, issue.path.map(String).join('.')));
}

function parseGuid(request: FastifyRequest, reply: FastifyReply): string | undefined {
  const parsed = dashboardGuidParamsSchema.safeParse(request.params);
  if (parsed.success) return parsed.data.guid;
  void reply.code(400).send(buildErrorResponse('Existen errores de validación.', validationErrors(parsed.error), request.id));
  return undefined;
}

export class DashboardsController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const filters = dashboardFiltersSchema.safeParse(request.query);
    if (!filters.success) {
      return reply.code(400).send(buildErrorResponse('Existen errores de validación.', validationErrors(filters.error), request.id));
    }
    const result = await service.list(request.company!, filters.data, request.dashboardCanManage ?? false);
    return reply
      .code(200)
      .send(
        buildSuccessResponse(
          result.dashboards,
          request.id,
          'Dashboards obtenidos correctamente.',
          buildPagination(filters.data.page, filters.data.pageSize, result.total),
        ),
      );
  }

  async get(request: FastifyRequest, reply: FastifyReply) {
    const guid = parseGuid(request, reply);
    if (!guid) return reply;
    const dashboard = await service.get(request.company!, guid, request.dashboardCanManage ?? false);
    return reply.code(200).send(buildSuccessResponse(dashboard, request.id, 'Dashboard obtenido correctamente.'));
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const input = createDashboardSchema.safeParse(request.body);
    if (!input.success) {
      return reply.code(400).send(buildErrorResponse('Existen errores de validación.', validationErrors(input.error), request.id));
    }
    const created = await service.create(request.company!, input.data, await actorId(request.principal!.sub));
    return reply.code(201).send(buildSuccessResponse(created, request.id, 'Dashboard creado correctamente.'));
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const guid = parseGuid(request, reply);
    if (!guid) return reply;
    const input = updateDashboardSchema.safeParse(request.body);
    if (!input.success) {
      return reply.code(400).send(buildErrorResponse('Existen errores de validación.', validationErrors(input.error), request.id));
    }
    const updated = await service.update(request.company!, guid, input.data, await actorId(request.principal!.sub));
    return reply.code(200).send(buildSuccessResponse(updated, request.id, 'Dashboard actualizado correctamente.'));
  }

  async duplicate(request: FastifyRequest, reply: FastifyReply) {
    const guid = parseGuid(request, reply);
    if (!guid) return reply;
    const input = duplicateDashboardSchema.safeParse(request.body ?? {});
    if (!input.success) {
      return reply.code(400).send(buildErrorResponse('Existen errores de validación.', validationErrors(input.error), request.id));
    }
    const duplicate = await service.duplicate(request.company!, guid, input.data.name, input.data.includePanels, await actorId(request.principal!.sub));
    return reply.code(201).send(buildSuccessResponse(duplicate, request.id, 'Dashboard duplicado correctamente.'));
  }

  async setStatus(request: FastifyRequest, reply: FastifyReply) {
    const guid = parseGuid(request, reply);
    if (!guid) return reply;
    const input = dashboardStatusRequestSchema.safeParse(request.body);
    if (!input.success) {
      return reply.code(400).send(buildErrorResponse('Existen errores de validación.', validationErrors(input.error), request.id));
    }
    const updated = await service.setStatus(request.company!, guid, input.data.status, input.data.expectedVersion, await actorId(request.principal!.sub));
    return reply.code(200).send(buildSuccessResponse(updated, request.id, 'Estado del Dashboard actualizado.'));
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const guid = parseGuid(request, reply);
    if (!guid) return reply;
    await service.delete(request.company!, guid);
    return reply.code(204).send();
  }
}

export const dashboardsController = new DashboardsController();
