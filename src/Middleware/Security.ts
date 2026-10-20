import type { FastifyReply, FastifyRequest } from 'fastify';
import { companyAccess, permission as getPermission } from '../Repositories/StoredProcedures/AuthRepository.js';
import type { CompanyContext, Principal } from '../Models/Common.js';
import { guid } from '../Models/Common.js';
import { buildErrorResponse, createError } from '../Helpers/ResponseHelper.js';
declare module 'fastify' { interface FastifyRequest { principal?: Principal; company?: CompanyContext } }
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try { const token = await request.jwtVerify<Principal>(); request.principal = { sub: token.sub, platformAdmin: token.platformAdmin }; }
  catch { return reply.code(401).send(buildErrorResponse('No autorizado.', [createError('UNAUTHORIZED', 'Credenciales no válidas o sesión expirada.')], request.id)); }
}
export async function resolveCompany(request: FastifyRequest, reply: FastifyReply) {
  const value = request.headers['x-company-guid'];
  if (typeof value !== 'string' || !guid.safeParse(value).success) return reply.code(400).send(buildErrorResponse('Existen errores de validación.', [createError('COMPANY_GUID_REQUIRED', 'El header X-Company-Guid es requerido y debe ser un UUID válido.', 'x-company-guid')], request.id));
  const access = await companyAccess(request.principal!.sub, value);
  if (!access && !request.principal!.platformAdmin) return reply.code(403).send(buildErrorResponse('Acceso denegado.', [createError('COMPANY_ACCESS_DENIED', 'El usuario no tiene acceso a la compañía indicada.')], request.id));
  if (!access) return reply.code(404).send(buildErrorResponse('Recurso no encontrado.', [createError('COMPANY_NOT_FOUND', 'La compañía indicada no existe o está inactiva.')], request.id));
  request.company = { guid: value, id: access.id };
}
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.principal?.platformAdmin) return;
    const result = await getPermission(request.principal!.sub, request.company!.guid, permission);
    if (!result?.allowed) return reply.code(403).send(buildErrorResponse('Acceso denegado.', [createError('PERMISSION_DENIED', `No tienes permiso para ejecutar esta acción: ${permission}`, permission)], request.id));
  };
}
