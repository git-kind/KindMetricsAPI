import type { FastifyInstance } from 'fastify';
import { buildErrorResponse, buildSuccessResponse, createError } from '../Helpers/ResponseHelper.js';
import { authenticate } from '../Middleware/Security.js';
import { requireCompanyManagementProfile } from '../Middleware/CompanyManagementAccess.js';
import {
  userCompanyAccessApiResponseSchema,
  userCompanyAccessParamsSchema,
  userCompanyAccessUpdateApiResponseSchema,
  updateUserCompanyAccessSchema,
} from '../Models/Companies/UserCompanyAccessDto.js';
import {
  listUserCompanyAccess,
  replaceUserCompanyAccess,
} from '../Repositories/UserCompanyAccessRepository.js';

function validationErrors(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  return error.issues.map((issue) =>
    createError('VALIDATION_ERROR', issue.message, issue.path.join('.')),
  );
}

export async function userCompanyAccessRoutes(app: FastifyInstance) {
  const adminHooks = [authenticate, requireCompanyManagementProfile(['Admin'])];

  app.get(
    '/companies/management/user-access',
    {
      preHandler: adminHooks,
      schema: {
        tags: ['Company user access'],
        response: {
          200: userCompanyAccessApiResponseSchema,
          401: userCompanyAccessApiResponseSchema,
          403: userCompanyAccessApiResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const access = await listUserCompanyAccess();
      return reply.code(200).send(
        buildSuccessResponse(
          access,
          request.id,
          'Usuarios y accesos a empresas obtenidos correctamente.',
        ),
      );
    },
  );

  app.put(
    '/companies/management/user-access/:userGuid',
    {
      preHandler: adminHooks,
      schema: {
        tags: ['Company user access'],
        response: {
          200: userCompanyAccessUpdateApiResponseSchema,
          400: userCompanyAccessUpdateApiResponseSchema,
          401: userCompanyAccessUpdateApiResponseSchema,
          403: userCompanyAccessUpdateApiResponseSchema,
          404: userCompanyAccessUpdateApiResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const params = userCompanyAccessParamsSchema.safeParse(request.params);
      const body = updateUserCompanyAccessSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        const issues = [
          ...(!params.success ? validationErrors(params.error) : []),
          ...(!body.success ? validationErrors(body.error) : []),
        ];
        return reply.code(400).send(
          buildErrorResponse('Existen errores de validación.', issues, request.id),
        );
      }

      const user = await replaceUserCompanyAccess(
        params.data.userGuid,
        body.data.companyIds,
      );
      if (!user) {
        return reply.code(404).send(
          buildErrorResponse(
            'Usuario no encontrado.',
            [createError('USER_NOT_FOUND', 'El usuario no existe o está inactivo.')],
            request.id,
          ),
        );
      }

      return reply.code(200).send(
        buildSuccessResponse(
          user,
          request.id,
          'Accesos del usuario actualizados correctamente.',
        ),
      );
    },
  );
}
