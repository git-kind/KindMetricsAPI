import type { FastifyReply, FastifyRequest } from 'fastify';
import { buildErrorResponse, createError } from '../Helpers/ResponseHelper.js';
import { getManagedUserProfileByGuid } from '../Repositories/UserManagementRepository.js';

export function requireUserProfile(allowedProfiles: ('Admin' | 'Visor')[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await getManagedUserProfileByGuid(request.principal!.sub);
    const normalizedStatus = user?.estatus.trim().toUpperCase();

    if (!user || (normalizedStatus !== 'ACTIVE' && normalizedStatus !== 'ACTIVO')) {
      return reply.code(401).send(buildErrorResponse('No autorizado.', [createError('UNAUTHORIZED', 'La cuenta no existe o está inactiva.')], request.id));
    }

    if (!allowedProfiles.includes(user.perfil)) {
      return reply
        .code(403)
        .send(
          buildErrorResponse(
            'Acceso denegado.',
            [createError('USER_PROFILE_FORBIDDEN', 'Tu perfil no tiene permiso para realizar esta operación.')],
            request.id,
          ),
        );
    }
  };
}
