import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../Config/DatabaseConfig.js';
import { buildErrorResponse, createError } from '../Helpers/ResponseHelper.js';

type UserAccessRow = RowDataPacket & {
  perfil: 'Admin' | 'Visor';
  status: string;
};

export function requireCompanyManagementProfile(allowedProfiles: ('Admin' | 'Visor')[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const [rows] = await pool.execute<UserAccessRow[]>(
      'SELECT perfil, status FROM users WHERE guid = ? LIMIT 1',
      [request.principal!.sub],
    );
    const user = rows[0];
    const normalizedStatus = user?.status.trim().toUpperCase();

    if (!user || (normalizedStatus !== 'ACTIVE' && normalizedStatus !== 'ACTIVO')) {
      return reply.code(401).send(
        buildErrorResponse(
          'No autorizado.',
          [createError('UNAUTHORIZED', 'La cuenta no existe o está inactiva.')],
          request.id,
        ),
      );
    }

    if (!allowedProfiles.includes(user.perfil)) {
      return reply.code(403).send(
        buildErrorResponse(
          'Acceso denegado.',
          [
            createError(
              'COMPANY_PROFILE_FORBIDDEN',
              'Tu perfil no tiene permiso para realizar esta operación.',
            ),
          ],
          request.id,
        ),
      );
    }
  };
}
