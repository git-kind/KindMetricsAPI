import type { FastifyReply, FastifyRequest } from 'fastify';
import { companyAccess, permission as getPermission } from '../Repositories/StoredProcedures/AuthRepository.js';
import type { CompanyContext, Principal } from '../Models/Common.js';
import { getCompanyManagementUserProfile, resolveCompanyByCode } from '../Repositories/CompanyManagementRepository.js';
import { buildErrorResponse, createError } from '../Helpers/ResponseHelper.js';
declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
    company?: CompanyContext;
    dashboardCanManage?: boolean;
  }
}

const companyCodePattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/;

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const token = await request.jwtVerify<Principal & { tokenType?: string }>();
    if (token.tokenType === 'refresh') {
      return reply
        .code(401)
        .send(buildErrorResponse('No autorizado.', [createError('UNAUTHORIZED', 'Credenciales no válidas o sesión expirada.')], request.id));
    }
    request.principal = { sub: token.sub, platformAdmin: token.platformAdmin };
  } catch {
    return reply.code(401).send(buildErrorResponse('No autorizado.', [createError('UNAUTHORIZED', 'Credenciales no válidas o sesión expirada.')], request.id));
  }
}

export async function resolveCompany(request: FastifyRequest, reply: FastifyReply) {
  const code = request.headers['x-company-code'];
  if (typeof code !== 'string' || !companyCodePattern.test(code)) {
    return reply
      .code(400)
      .send(
        buildErrorResponse(
          'Existen errores de validación.',
          [createError('COMPANY_CODE_REQUIRED', 'El header x-company-code es requerido y debe contener un código válido.', 'x-company-code')],
          request.id,
        ),
      );
  }

  const company = await resolveCompanyByCode(code);
  if (!company || !['ACTIVE', 'ACTIVO'].includes(company.status.trim().toUpperCase())) {
    return reply
      .code(404)
      .send(buildErrorResponse('Recurso no encontrado.', [createError('COMPANY_NOT_FOUND', 'La compañía indicada no existe o está inactiva.')], request.id));
  }

  if (!request.principal!.platformAdmin) {
    const access = await companyAccess(request.principal!.sub, company.guid);
    if (!access) {
      return reply
        .code(403)
        .send(buildErrorResponse('Acceso denegado.', [createError('COMPANY_ACCESS_DENIED', 'El usuario no tiene acceso a la compañía indicada.')], request.id));
    }
  }

  request.company = { guid: company.guid, id: company.id, code: company.code };
}

export async function resolveDashboardReadAccess(request: FastifyRequest, reply: FastifyReply) {
  if (request.principal?.platformAdmin) {
    request.dashboardCanManage = true;
    return;
  }

  const profile = await getCompanyManagementUserProfile(request.principal!.sub);
  if (profile === 'Admin') {
    request.dashboardCanManage = true;
    return;
  }
  if (profile === 'Visor') {
    request.dashboardCanManage = false;
    return;
  }

  return reply
    .code(403)
    .send(
      buildErrorResponse('Acceso denegado.', [createError('COMPANY_PROFILE_FORBIDDEN', 'Tu perfil no tiene permiso para consultar Dashboards.')], request.id),
    );
}

export async function requireDashboardAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.principal?.platformAdmin) {
    request.dashboardCanManage = true;
    return;
  }

  const profile = await getCompanyManagementUserProfile(request.principal!.sub);
  if (profile !== 'Admin') {
    return reply
      .code(403)
      .send(buildErrorResponse('Acceso denegado.', [createError('COMPANY_PROFILE_FORBIDDEN', 'Solo Admin puede modificar Dashboards.')], request.id));
  }
  request.dashboardCanManage = true;
}

export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.principal?.platformAdmin) return;
    const result = await getPermission(request.principal!.sub, request.company!.guid, permission);
    if (!result?.allowed)
      return reply
        .code(403)
        .send(
          buildErrorResponse(
            'Acceso denegado.',
            [createError('PERMISSION_DENIED', `No tienes permiso para ejecutar esta acción: ${permission}`, permission)],
            request.id,
          ),
        );
  };
}
