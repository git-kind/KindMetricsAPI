import type { FastifyInstance } from 'fastify';
import { buildSuccessResponse } from '../Helpers/ResponseHelper.js';
import { authenticate } from '../Middleware/Security.js';
import { availableCompaniesApiResponseSchema } from '../Models/Companies/AvailableCompanyDto.js';
import { UserCompanyAccessService } from '../Services/UserCompanyAccessService.js';

export async function companySelectionRoutes(app: FastifyInstance) {
  const service = new UserCompanyAccessService();
  app.get(
    '/companies/available',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Companies'],
        security: [{ bearerAuth: [] }],
        response: {
          200: availableCompaniesApiResponseSchema,
          401: availableCompaniesApiResponseSchema,
          503: availableCompaniesApiResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const companies = await service.listAvailableCompanies(request.principal!.sub);
      return reply.code(200).send(
        buildSuccessResponse(
          companies,
          request.id,
          'Empresas disponibles obtenidas correctamente.',
        ),
      );
    },
  );
}
