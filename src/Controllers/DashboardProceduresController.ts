import type { FastifyReply, FastifyRequest } from 'fastify';
import { buildErrorResponse, buildSuccessResponse, createError } from '../Helpers/ResponseHelper.js';
import {
  createDashboardProcedureSchema,
  dashboardProcedureGuidParamsSchema,
  updateDashboardProcedureSchema,
} from '../Models/DashboardProcedures/DashboardProcedureDto.js';
import { actorId } from '../Repositories/StoredProcedures/ActorRepository.js';
import { DashboardProceduresService } from '../Services/DashboardProceduresService.js';

const service = new DashboardProceduresService();

function validationErrors(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  return error.issues.map((issue) => createError('VALIDATION_ERROR', issue.message, issue.path.map(String).join('.')));
}

export class DashboardProceduresController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const data = await service.list(request.company!);
    return reply.code(200).send(buildSuccessResponse(data, request.id, 'Procedimientos autorizados obtenidos correctamente.'));
  }

  async get(request: FastifyRequest, reply: FastifyReply) {
    const params = dashboardProcedureGuidParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', validationErrors(params.error), request.id));
    const data = await service.get(request.company!, params.data.guid);
    return reply.code(200).send(buildSuccessResponse(data, request.id, 'Procedimiento autorizado obtenido correctamente.'));
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const input = createDashboardProcedureSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', validationErrors(input.error), request.id));
    const data = await service.create(request.company!, input.data, await actorId(request.principal!.sub));
    return reply.code(201).send(buildSuccessResponse(data, request.id, 'Procedimiento registrado para revisión.'));
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const params = dashboardProcedureGuidParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', validationErrors(params.error), request.id));
    const input = updateDashboardProcedureSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', validationErrors(input.error), request.id));
    const data = await service.update(request.company!, params.data.guid, input.data, await actorId(request.principal!.sub));
    return reply.code(200).send(buildSuccessResponse(data, request.id, 'Procedimiento autorizado actualizado correctamente.'));
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const params = dashboardProcedureGuidParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', validationErrors(params.error), request.id));
    await service.delete(request.company!, params.data.guid);
    return reply.code(204).send();
  }
}

export const dashboardProceduresController = new DashboardProceduresController();