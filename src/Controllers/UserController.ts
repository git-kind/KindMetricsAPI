import type { FastifyInstance } from 'fastify';
import { authenticate, resolveCompany, requirePermission } from '../Middleware/Security.js';
import { guid } from '../Models/Common.js';
import { createUserRequestSchema, type CreateUserRequestDto } from '../Models/Users/CreateUserRequestDto.js';
import type { UserResponseDto } from '../Models/Users/UserResponseDto.js';
import { UserService } from '../Services/UserService.js';
import { buildErrorResponse, buildSuccessResponse, createError } from '../Helpers/ResponseHelper.js';
export async function userRoutes(app: FastifyInstance) {
  const service = new UserService();
  const hooks = [authenticate, resolveCompany, requirePermission('users:manage:company')];
  app.get('/users', { preHandler: hooks, schema: { tags: ['Users'] } }, async (request, reply) => {
    const users = await service.list(request.company!.id);
    return reply.code(200).send(buildSuccessResponse(users as UserResponseDto[], request.id, 'Usuarios obtenidos correctamente.'));
  });
  app.post('/users', { preHandler: hooks, schema: { tags: ['Users'], body: createUserRequestSchema } }, async (request, reply) => {
    const parsed = createUserRequestSchema.safeParse(request.body as CreateUserRequestDto);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => createError('VALIDATION_ERROR', issue.message, issue.path.join('.')));
      return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues, request.id));
    }
    const data = parsed.data;
    const createdRows = await service.create(request.company!.id, data, request.principal!.sub);
    const created = createdRows[0] as UserResponseDto | undefined;
    if (!created) {
      return reply.code(500).send(buildErrorResponse('No se pudo crear el usuario.', [createError('USER_CREATE_FAILED', 'El usuario no pudo crearse.')], request.id));
    }
    return reply.code(201).send(buildSuccessResponse(created, request.id, 'Usuario creado correctamente.'));
  });
  app.patch('/users/:guid', { preHandler: hooks, schema: { tags: ['Users'] } }, async (request, reply) => {
    const id = guid.safeParse((request.params as { guid: string }).guid);
    if (!id.success) return reply.code(400).send(buildErrorResponse('Identificador inválido.', [createError('INVALID_GUID', 'El guid especificado no es válido.', 'guid')], request.id));
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', [createError('INVALID_BODY', 'El body debe ser un objeto válido.', 'body')], request.id));
    const updatedRows = await service.update(id.data, request.company!.id, body, request.principal!.sub);
    const updated = updatedRows[0] as UserResponseDto | undefined;
    if (!updated) {
      return reply.code(404).send(buildErrorResponse('Usuario no encontrado.', [createError('USER_NOT_FOUND', 'El usuario solicitado no existe.')], request.id));
    }
    return reply.code(200).send(buildSuccessResponse(updated, request.id, 'Usuario actualizado correctamente.'));
  });
  app.delete('/users/:guid', { preHandler: hooks, schema: { tags: ['Users'] } }, async (request, reply) => {
    const id = guid.safeParse((request.params as { guid: string }).guid);
    if (!id.success) return reply.code(400).send(buildErrorResponse('Identificador inválido.', [createError('INVALID_GUID', 'El guid especificado no es válido.', 'guid')], request.id));
    const deletedRows = await service.delete(id.data, request.company!.id, request.principal!.sub);
    const deleted = deletedRows[0] as UserResponseDto | undefined;
    if (!deleted) {
      return reply.code(404).send(buildErrorResponse('Usuario no encontrado.', [createError('USER_NOT_FOUND', 'El usuario solicitado no existe.')], request.id));
    }
    return reply.code(200).send(buildSuccessResponse(deleted, request.id, 'Usuario eliminado correctamente.'));
  });
}
