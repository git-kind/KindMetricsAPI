import type { FastifyReply, FastifyRequest } from 'fastify';
import { buildErrorResponse, createError } from '../Helpers/ResponseHelper.js';
import { normalizeUserRole, type UserRole } from '../Models/Auth/UserRole.js';
import { getCompanyManagementUserProfile } from '../Repositories/CompanyManagementRepository.js';

export function authorizeRoles(allowedRoles: readonly UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const claimedRole = request.principal?.platformAdmin
      ? 'Admin'
      : normalizeUserRole(request.principal?.role);

    if (claimedRole && !allowedRoles.includes(claimedRole)) {
      return reply.code(403).send(
        buildErrorResponse(
          'Acceso denegado.',
          [
            createError(
              'ROLE_FORBIDDEN',
              'Tu rol no tiene permiso para realizar esta operación.',
            ),
          ],
          request.id,
        ),
      );
    }

    const storedRole = request.principal?.platformAdmin
      ? 'Admin'
      : normalizeUserRole(
          await getCompanyManagementUserProfile(request.principal!.sub),
        );
    if (!storedRole) {
      return reply.code(401).send(
        buildErrorResponse(
          'No autorizado.',
          [createError('UNAUTHORIZED', 'La cuenta no existe o está inactiva.')],
          request.id,
        ),
      );
    }

    if (!allowedRoles.includes(storedRole)) {
      return reply.code(403).send(
        buildErrorResponse(
          'Acceso denegado.',
          [
            createError(
              'ROLE_FORBIDDEN',
              'Tu rol no tiene permiso para realizar esta operación.',
            ),
          ],
          request.id,
        ),
      );
    }

    request.dashboardCanManage = storedRole === 'Admin' || storedRole === 'Editor';
  };
}
