import type { FastifyInstance } from 'fastify';
import { buildErrorResponse, buildSuccessResponse, createError } from '../Helpers/ResponseHelper.js';
import { authenticate } from '../Middleware/Security.js';
import { requireCompanyManagementProfile } from '../Middleware/CompanyManagementAccess.js';
import {
  createManagedUserSchema,
  updateManagedUserSchema,
  userManagementIdParamsSchema,
} from '../Models/Users/UserManagementDto.js';
import { UserManagementService } from '../Services/UserManagementService.js';

const service = new UserManagementService();

function validationErrors(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  return error.issues.map((issue) =>
    createError('VALIDATION_ERROR', issue.message, issue.path.join('.')),
  );
}

export async function userManagementRoutes(app: FastifyInstance) {
  const readHooks = [authenticate, requireCompanyManagementProfile(['Admin', 'Visor'])];
  const adminHooks = [authenticate, requireCompanyManagementProfile(['Admin'])];

  app.get(
    '/users/management',
    { preHandler: readHooks, schema: { tags: ['User management'] } },
    async (request, reply) => {
      const users = await service.list();
      return reply.code(200).send(
        buildSuccessResponse(users, request.id, 'Usuarios obtenidos correctamente.'),
      );
    },
  );

  app.get(
    '/users/management/:id',
    { preHandler: readHooks, schema: { tags: ['User management'] } },
    async (request, reply) => {
      const params = userManagementIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(
          buildErrorResponse(
            'Identificador inválido.',
            validationErrors(params.error),
            request.id,
          ),
        );
      }

      const user = await service.getById(params.data.id);
      if (!user) {
        return reply.code(404).send(
          buildErrorResponse(
            'Usuario no encontrado.',
            [createError('USER_NOT_FOUND', 'El usuario solicitado no existe o está inactivo.')],
            request.id,
          ),
        );
      }
      return reply.code(200).send(
        buildSuccessResponse(user, request.id, 'Usuario obtenido correctamente.'),
      );
    },
  );

  app.post(
    '/users/management',
    { preHandler: adminHooks, schema: { tags: ['User management'] } },
    async (request, reply) => {
      const parsed = createManagedUserSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(
          buildErrorResponse(
            'Existen errores de validación.',
            validationErrors(parsed.error),
            request.id,
          ),
        );
      }
      try {
        const user = await service.create(parsed.data);
        return reply.code(201).send(
          buildSuccessResponse(user, request.id, 'Usuario creado correctamente.'),
        );
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'USER_EMAIL_ALREADY_EXISTS') {
          return reply.code(409).send(buildErrorResponse(
            'Conflicto de negocio.',
            [createError('USER_EMAIL_ALREADY_EXISTS', 'Ya existe un usuario con ese correo electrónico.', 'email')],
            request.id,
          ));
        }
        throw error;
      }
    },
  );

  app.put(
    '/users/management/:id',
    { preHandler: adminHooks, schema: { tags: ['User management'] } },
    async (request, reply) => {
      const params = userManagementIdParamsSchema.safeParse(request.params);
      const parsed = updateManagedUserSchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        const issues = [
          ...(!params.success ? validationErrors(params.error) : []),
          ...(!parsed.success ? validationErrors(parsed.error) : []),
        ];
        return reply.code(400).send(
          buildErrorResponse('Existen errores de validación.', issues, request.id),
        );
      }

      try {
        const user = await service.update(params.data.id, parsed.data);
        if (!user) {
          return reply.code(404).send(
            buildErrorResponse(
              'Usuario no encontrado.',
              [createError('USER_NOT_FOUND', 'El usuario solicitado no existe o está inactivo.')],
              request.id,
            ),
          );
        }
        return reply.code(200).send(
          buildSuccessResponse(user, request.id, 'Usuario actualizado correctamente.'),
        );
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'USER_EMAIL_ALREADY_EXISTS') {
          return reply.code(409).send(buildErrorResponse(
            'Conflicto de negocio.',
            [createError('USER_EMAIL_ALREADY_EXISTS', 'Ya existe un usuario con ese correo electrónico.', 'email')],
            request.id,
          ));
        }
        throw error;
      }
    },
  );

  app.delete(
    '/users/management/:id',
    { preHandler: adminHooks, schema: { tags: ['User management'] } },
    async (request, reply) => {
      const params = userManagementIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(
          buildErrorResponse(
            'Identificador inválido.',
            validationErrors(params.error),
            request.id,
          ),
        );
      }
      const result = await service.deactivate(params.data.id);
      if (result.protected) {
        return reply.code(403).send(
          buildErrorResponse(
            'Acceso denegado.',
            [createError('SYSTEM_ADMIN_PROTECTED', 'El usuario Administrador del Sistema está protegido.')],
            request.id,
          ),
        );
      }
      if (!result.deactivated) {
        return reply.code(404).send(
          buildErrorResponse(
            'Usuario no encontrado.',
            [createError('USER_NOT_FOUND', 'El usuario solicitado no existe o está inactivo.')],
            request.id,
          ),
        );
      }
      return reply.code(200).send(
        buildSuccessResponse({ id: params.data.id }, request.id, 'Usuario desactivado correctamente.'),
      );
    },
  );
}
