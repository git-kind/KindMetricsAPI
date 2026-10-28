import type { FastifyInstance } from 'fastify';
import { buildErrorResponse, buildSuccessResponse, createError } from '../Helpers/ResponseHelper.js';
import { authenticate } from '../Middleware/Security.js';
import { requireCompanyManagementProfile } from '../Middleware/CompanyManagementAccess.js';
import {
  companyManagementAccessResponseSchema,
  companyApiResponseSchema,
  companyIdParamsSchema,
  createCompanySchema,
  updateCompanySchema,
} from '../Models/Companies/CompanyManagementDto.js';
import {
  createCompany,
  deactivateCompany,
  getCompanyManagementUserProfile,
  getCompanyById,
  listCompanies,
  updateCompany,
} from '../Repositories/CompanyManagementRepository.js';

const responseSchemas = {
  200: companyApiResponseSchema,
  201: companyApiResponseSchema,
  400: companyApiResponseSchema,
  401: companyApiResponseSchema,
  403: companyApiResponseSchema,
  404: companyApiResponseSchema,
  409: companyApiResponseSchema,
};

function validationErrors(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  return error.issues.map((issue) =>
    createError('VALIDATION_ERROR', issue.message, issue.path.join('.')),
  );
}

export async function companyManagementRoutes(app: FastifyInstance) {
  const readHooks = [authenticate, requireCompanyManagementProfile(['Admin', 'Visor'])];
  const adminHooks = [authenticate, requireCompanyManagementProfile(['Admin'])];

  app.get(
    '/companies/management/access',
    {
      preHandler: readHooks,
      schema: {
        tags: ['Company management'],
        response: {
          200: companyManagementAccessResponseSchema,
          401: companyApiResponseSchema,
          403: companyApiResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const perfil = await getCompanyManagementUserProfile(request.principal!.sub);
      if (!perfil) {
        return reply.code(403).send(
          buildErrorResponse(
            'Acceso denegado.',
            [createError('COMPANY_PROFILE_FORBIDDEN', 'El perfil no permite consultar esta sección.')],
            request.id,
          ),
        );
      }
      return reply.code(200).send(
        buildSuccessResponse(
          { perfil, canManage: perfil === 'Admin' },
          request.id,
          'Permisos de empresas obtenidos correctamente.',
        ),
      );
    },
  );

  app.get(
    '/companies/management',
    {
      preHandler: readHooks,
      schema: { tags: ['Company management'], response: responseSchemas },
    },
    async (request, reply) => {
      const companies = await listCompanies();
      return reply.code(200).send(
        buildSuccessResponse(companies, request.id, 'Empresas obtenidas correctamente.'),
      );
    },
  );

  app.get(
    '/companies/management/:id',
    {
      preHandler: readHooks,
      schema: { tags: ['Company management'], response: responseSchemas },
    },
    async (request, reply) => {
      const params = companyIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(
          buildErrorResponse('Identificador inválido.', validationErrors(params.error), request.id),
        );
      }

      const company = await getCompanyById(params.data.id);
      if (!company) {
        return reply.code(404).send(
          buildErrorResponse(
            'Empresa no encontrada.',
            [createError('COMPANY_NOT_FOUND', 'La empresa solicitada no existe.')],
            request.id,
          ),
        );
      }
      return reply.code(200).send(
        buildSuccessResponse(company, request.id, 'Empresa obtenida correctamente.'),
      );
    },
  );

  app.post(
    '/companies/management',
    {
      preHandler: adminHooks,
      schema: { tags: ['Company management'], response: responseSchemas },
    },
    async (request, reply) => {
      const parsed = createCompanySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(
          buildErrorResponse('Existen errores de validación.', validationErrors(parsed.error), request.id),
        );
      }

      const company = await createCompany(parsed.data);
      return reply.code(201).send(
        buildSuccessResponse(company, request.id, 'Empresa creada correctamente.'),
      );
    },
  );

  app.put(
    '/companies/management/:id',
    {
      preHandler: adminHooks,
      schema: { tags: ['Company management'], response: responseSchemas },
    },
    async (request, reply) => {
      const params = companyIdParamsSchema.safeParse(request.params);
      const parsed = updateCompanySchema.safeParse(request.body);
      if (!params.success) {
        return reply.code(400).send(
          buildErrorResponse('Identificador inválido.', validationErrors(params.error), request.id),
        );
      }
      if (!parsed.success) {
        return reply.code(400).send(
          buildErrorResponse('Existen errores de validación.', validationErrors(parsed.error), request.id),
        );
      }

      const company = await updateCompany(params.data.id, parsed.data);
      if (!company) {
        return reply.code(404).send(
          buildErrorResponse(
            'Empresa no encontrada.',
            [createError('COMPANY_NOT_FOUND', 'La empresa solicitada no existe.')],
            request.id,
          ),
        );
      }
      return reply.code(200).send(
        buildSuccessResponse(company, request.id, 'Empresa actualizada correctamente.'),
      );
    },
  );

  app.delete(
    '/companies/management/:id',
    {
      preHandler: adminHooks,
      schema: { tags: ['Company management'], response: responseSchemas },
    },
    async (request, reply) => {
      const params = companyIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(
          buildErrorResponse('Identificador inválido.', validationErrors(params.error), request.id),
        );
      }

      const company = await deactivateCompany(params.data.id);
      if (!company) {
        return reply.code(404).send(
          buildErrorResponse(
            'Empresa no encontrada.',
            [createError('COMPANY_NOT_FOUND', 'La empresa solicitada no existe.')],
            request.id,
          ),
        );
      }
      return reply.code(200).send(
        buildSuccessResponse(company, request.id, 'Empresa desactivada correctamente.'),
      );
    },
  );
}
