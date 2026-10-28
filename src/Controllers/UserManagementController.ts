import type { FastifyInstance } from 'fastify';
import argon2 from 'argon2';
import { AppError } from '../Errors/AppError.js';
import { buildErrorResponse, buildSuccessResponse, createError } from '../Helpers/ResponseHelper.js';
import { authenticate } from '../Middleware/Security.js';
import { requireCompanyManagementProfile } from '../Middleware/CompanyManagementAccess.js';
import {
  createManagedUserSchema,
  updateManagedUserSchema,
  userManagementIdParamsSchema,
} from '../Models/Users/UserManagementDto.js';
import {
  createManagedUser,
  deactivateManagedUser,
  getManagedUserById,
  isManagedUserEmailTaken,
  listManagedUsers,
  updateManagedUser,
} from '../Repositories/UserManagementRepository.js';

function validationErrors(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  return error.issues.map((issue) =>
    createError('VALIDATION_ERROR', issue.message, issue.path.join('.')),
  );
}

function throwDuplicateEmail(error: unknown): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ER_DUP_ENTRY'
  ) {
    throw new AppError('Ya existe un usuario con ese correo electrónico.', {
      statusCode: 409,
      code: 'USER_EMAIL_ALREADY_EXISTS',
      field: 'email',
    });
  }
  throw error;
}

export async function userManagementRoutes(app: FastifyInstance) {
  const readHooks = [authenticate, requireCompanyManagementProfile(['Admin', 'Visor'])];
  const adminHooks = [authenticate, requireCompanyManagementProfile(['Admin'])];

  app.get(
    '/users/management',
    { preHandler: readHooks, schema: { tags: ['User management'] } },
    async (request, reply) => {
      const users = await listManagedUsers();
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

      const user = await getManagedUserById(params.data.id);
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
      if (await isManagedUserEmailTaken(parsed.data.email)) {
        return reply.code(409).send(
          buildErrorResponse(
            'Conflicto de negocio.',
            [createError('USER_EMAIL_ALREADY_EXISTS', 'Ya existe un usuario con ese correo electrónico.', 'email')],
            request.id,
          ),
        );
      }

      try {
        const user = await createManagedUser({
          nombre: parsed.data.nombre,
          email: parsed.data.email,
          perfil: parsed.data.perfil,
          passwordHash: await argon2.hash(parsed.data.password),
        });
        if (!user) {
          throw new AppError('No se pudo recuperar el usuario recién creado.', {
            code: 'USER_CREATE_FAILED',
          });
        }
        return reply.code(201).send(
          buildSuccessResponse(user, request.id, 'Usuario creado correctamente.'),
        );
      } catch (error) {
        return throwDuplicateEmail(error);
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

      if (parsed.data.email && (await isManagedUserEmailTaken(parsed.data.email, params.data.id))) {
        return reply.code(409).send(
          buildErrorResponse(
            'Conflicto de negocio.',
            [createError('USER_EMAIL_ALREADY_EXISTS', 'Ya existe un usuario con ese correo electrónico.', 'email')],
            request.id,
          ),
        );
      }

      try {
        const user = await updateManagedUser(params.data.id, {
          ...(parsed.data.nombre !== undefined ? { nombre: parsed.data.nombre } : {}),
          ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
          ...(parsed.data.perfil !== undefined ? { perfil: parsed.data.perfil } : {}),
          ...(parsed.data.password !== undefined
            ? { passwordHash: await argon2.hash(parsed.data.password) }
            : {}),
        });
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
        return throwDuplicateEmail(error);
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
      if (params.data.id === 1) {
        const user = await getManagedUserById(params.data.id);
        if (user?.email.toLowerCase() === 'admin@kindtech.com') {
          return reply.code(403).send(
            buildErrorResponse(
              'Acceso denegado.',
              [createError('SYSTEM_ADMIN_PROTECTED', 'El usuario Administrador del Sistema está protegido.')],
              request.id,
            ),
          );
        }
      }

      const deactivated = await deactivateManagedUser(params.data.id);
      if (!deactivated) {
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
