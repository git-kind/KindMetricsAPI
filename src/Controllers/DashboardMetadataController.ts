import type { FastifyReply, FastifyRequest } from 'fastify';
import { buildErrorResponse, buildSuccessResponse, createError } from '../Helpers/ResponseHelper.js';
import {
  dashboardProcedurePreviewSchema,
  dashboardSchemaQuerySchema,
  validateDashboardProcedureSchema,
} from '../Models/DashboardMetadata/DashboardMetadataDto.js';
import { DashboardMetadataService } from '../Services/DashboardMetadataService.js';

const service = new DashboardMetadataService();

function validationErrors(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  return error.issues.map((issue) => createError('VALIDATION_ERROR', issue.message, issue.path.map(String).join('.')));
}

export class DashboardMetadataController {
  async schema(request: FastifyRequest, reply: FastifyReply) {
    const query = dashboardSchemaQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', validationErrors(query.error), request.id));
    const data = await service.schema(request.company!, query.data);
    return reply.code(200).send(buildSuccessResponse(data, request.id, 'Metadata del esquema obtenida correctamente.'));
  }

  async discoverProcedures(request: FastifyRequest, reply: FastifyReply) {
    const data = await service.discoverProcedures(request.company!);
    return reply.code(200).send(buildSuccessResponse(data, request.id, 'Procedimientos de datos descubiertos correctamente.'));
  }

  async validateProcedure(request: FastifyRequest, reply: FastifyReply) {
    const input = validateDashboardProcedureSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', validationErrors(input.error), request.id));
    const data = await service.validateProcedure(request.company!, input.data);
    return reply.code(200).send(buildSuccessResponse(data, request.id, 'Validación del procedimiento completada.'));
  }

  async previewProcedure(request: FastifyRequest, reply: FastifyReply) {
    const input = dashboardProcedurePreviewSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', validationErrors(input.error), request.id));
    const data = await service.previewProcedure(request.company!, input.data);
    return reply.code(200).send(buildSuccessResponse(data, request.id, 'Preview del procedimiento ejecutado correctamente.'));
  }
}

export const dashboardMetadataController = new DashboardMetadataController();
