import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../Errors/AppError.js';
import { buildErrorResponse, buildSuccessResponse, createError } from '../Helpers/ResponseHelper.js';
import { authenticate } from '../Middleware/Security.js';
import { requireUserProfile } from '../Middleware/UserManagementAccess.js';
import {
  createManagedUserSchema,
  managedUserApiResponseSchema,
  managedUserIdParamsSchema,
  updateManagedUserSchema,
} from '../Models/Users/UserManagementDto.js';
import { createManagedUser, deactivateManagedUser, getManagedUserById, listManagedUsers, updateManagedUser } from '../Repositories/UserManagementRepository.js';

const responseSchemas = {
  200: managedUserApiResponseSchema,
  201: managedUserApiResponseSchema,
  400: managedUserApiResponseSchema,
  401: managedUserApiResponseSchema,
  403: managedUserApiResponseSchema,
  404: managedUserApiResponseSchema,
  409: managedUserApiResponseSchema,
};

function validationErrors(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  return error.issues.map((issue) => createError('VALIDATION_ERROR', issue.message, issue.path.join('.')));
}

function isSystemAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === 'admin@kindtech.com';
}

export async function userManagementRoutes(app: FastifyInstance) {
  const readHooks = [authenticate, requireUserProfile(['Admin', 'Visor'])];
  const adminHooks = [authenticate, requireUserProfile(['Admin'])];

  app.get(
    '/users/management',
    {
      preHandler: readHooks,
      schema: { tags: ['User management'], response: responseSchemas },
    },
    async (request, reply) => {
      const users = await listManagedUsers();
      return reply.code(200).send(buildSuccessResponse(users, request.id, 'Usuarios obtenidos correctamente.'));
    },
  );

  app.get(
    '/users/management/:id',
    {
      preHandler: readHooks,
      schema: { tags: ['User management'], response: responseSchemas },
    },
    async (request, reply) => {
      const parsedParams = managedUserIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send(buildErrorResponse('Identificador inválido.', validationErrors(parsedParams.error), request.id));
      }

      const user = await getManagedUserById(parsedParams.data.id);
      if (!user) {
        return reply
          .code(404)
          .send(buildErrorResponse('Usuario no encontrado.', [createError('USER_NOT_FOUND', 'El usuario solicitado no existe.')], request.id));
      }

      return reply.code(200).send(buildSuccessResponse(user, request.id, 'Usuario obtenido correctamente.'));
    },
  );

  app.post(
    '/users/management',
    {
      preHandler: adminHooks,
      schema: {
        tags: ['User management'],
        body: createManagedUserSchema,
        response: responseSchemas,
      },
    },
    async (request, reply) => {
      const parsedBody = createManagedUserSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send(buildErrorResponse('Existen errores de validación.', validationErrors(parsedBody.error), request.id));
      }

      const data = parsedBody.data;
      const user = await createManagedUser({
        nombre: data.nombre,
        email: data.email.toLowerCase(),
        passwordHash: await argon2.hash(data.password),
        perfil: data.perfil,
        estatus: data.estatus ?? 'Activo',
      });

      return reply.code(201).send(buildSuccessResponse(user, request.id, 'Usuario creado correctamente.'));
    },
  );

  app.put(
    '/users/management/:id',
    {
      preHandler: adminHooks,
      schema: {
        tags: ['User management'],
        body: updateManagedUserSchema,
        response: responseSchemas,
      },
    },
    async (request, reply) => {
      const parsedParams = managedUserIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send(buildErrorResponse('Identificador inválido.', validationErrors(parsedParams.error), request.id));
      }

      const parsedBody = updateManagedUserSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send(buildErrorResponse('Existen errores de validación.', validationErrors(parsedBody.error), request.id));
      }

      const data = parsedBody.data;
      const user = await updateManagedUser(parsedParams.data.id, {
        ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
        ...(data.email !== undefined ? { email: data.email.toLowerCase() } : {}),
        ...(data.password !== undefined ? { passwordHash: await argon2.hash(data.password) } : {}),
        ...(data.perfil !== undefined ? { perfil: data.perfil } : {}),
        ...(data.estatus !== undefined ? { estatus: data.estatus } : {}),
      });

      if (!user) {
        return reply
          .code(404)
          .send(buildErrorResponse('Usuario no encontrado.', [createError('USER_NOT_FOUND', 'El usuario solicitado no existe.')], request.id));
      }

      return reply.code(200).send(buildSuccessResponse(user, request.id, 'Usuario actualizado correctamente.'));
    },
  );

  app.delete(
    '/users/management/:id',
    {
      preHandler: adminHooks,
      schema: { tags: ['User management'], response: responseSchemas },
    },
    async (request, reply) => {
      const parsedParams = managedUserIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send(buildErrorResponse('Identificador inválido.', validationErrors(parsedParams.error), request.id));
      }

      const target = await getManagedUserById(parsedParams.data.id);
      if (!target) {
        return reply
          .code(404)
          .send(buildErrorResponse('Usuario no encontrado.', [createError('USER_NOT_FOUND', 'El usuario solicitado no existe.')], request.id));
      }
      if (isSystemAdminEmail(target.email)) {
        const message = 'El usuario Administrador del Sistema está blindado y no puede ser eliminado ni desactivar su cuenta';
        return reply.code(403).send(buildErrorResponse(message, [createError('SYSTEM_ADMIN_PROTECTED', message)], request.id));
      }

      try {
        const user = await deactivateManagedUser(parsedParams.data.id);
        if (!user) {
          return reply
            .code(404)
            .send(buildErrorResponse('Usuario no encontrado.', [createError('USER_NOT_FOUND', 'El usuario solicitado no existe.')], request.id));
        }
        return reply.code(200).send(buildSuccessResponse(user, request.id, 'Usuario desactivado correctamente.'));
      } catch (error) {
        if (error instanceof AppError && error.code === 'SYSTEM_ADMIN_PROTECTED') {
          return reply.code(403).send(buildErrorResponse(error.message, [createError(error.code, error.message)], request.id));
        }
        throw error;
      }
    },
  );
}
