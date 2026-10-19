import type { FastifyReply, FastifyRequest } from 'fastify';
import { authRepository } from '../Repositories/StoredProcedures/AuthRepository.js';
import type { CompanyContext, Principal } from '../Models/Common.js';
import { guid } from '../Models/Common.js';
declare module 'fastify' { interface FastifyRequest { principal?: Principal; company?: CompanyContext } }
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try { const token = await request.jwtVerify<Principal>(); request.principal = { sub: token.sub, platformAdmin: token.platformAdmin }; }
  catch { return reply.code(401).send({ error: 'UNAUTHENTICATED' }); }
}
export async function resolveCompany(request: FastifyRequest, reply: FastifyReply) {
  const value = request.headers['x-company-guid'];
  if (typeof value !== 'string' || !guid.safeParse(value).success) return reply.code(400).send({ error: 'COMPANY_GUID_REQUIRED' });
  const access = await authRepository.companyAccess(request.principal!.sub, value);
  if (!access && !request.principal!.platformAdmin) return reply.code(403).send({ error: 'COMPANY_ACCESS_DENIED' });
  if (!access) return reply.code(404).send({ error: 'COMPANY_NOT_FOUND' });
  request.company = { guid: value, id: access.id };
}
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.principal?.platformAdmin) return;
    const result = await authRepository.permission(request.principal!.sub, request.company!.guid, permission);
    if (!result?.allowed) return reply.code(403).send({ error: 'PERMISSION_DENIED', permission });
  };
}
