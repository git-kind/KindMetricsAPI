import type { FastifyInstance } from 'fastify';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { authenticate, resolveCompany, requirePermission } from '../Middleware/Security.js';
import { userCreateSchema, guid } from '../Models/Common.js';
import { authRepository } from '../Repositories/StoredProcedures/AuthRepository.js';
import { actorId } from '../Repositories/StoredProcedures/ActorRepository.js';
export async function userRoutes(app: FastifyInstance) {
  const hooks = [authenticate, resolveCompany, requirePermission('users:manage:company')];
  app.get('/users', { preHandler: hooks, schema: { tags: ['Users'] } }, async (request) => authRepository.listUsers(request.company!.id));
  app.post('/users', { preHandler: hooks, schema: { tags: ['Users'], body: userCreateSchema } }, async (request, reply) => {
    const parsed = userCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY', issues: parsed.error.issues });
    const data = parsed.data;
    return reply.code(201).send(await authRepository.createUser(randomUUID(), data.email.toLowerCase(), data.name, await argon2.hash(data.password), request.company!.id, await actorId(request.principal!.sub)));
  });
  app.patch('/users/:guid', { preHandler: hooks, schema: { tags: ['Users'] } }, async (request, reply) => {
    const id = guid.safeParse((request.params as { guid: string }).guid);
    if (!id.success) return reply.code(400).send({ error: 'INVALID_GUID' });
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply.code(400).send({ error: 'INVALID_BODY' });
    return authRepository.updateUser(id.data, request.company!.id, body, await actorId(request.principal!.sub));
  });
  app.delete('/users/:guid', { preHandler: hooks, schema: { tags: ['Users'] } }, async (request, reply) => {
    const id = guid.safeParse((request.params as { guid: string }).guid);
    if (!id.success) return reply.code(400).send({ error: 'INVALID_GUID' });
    return authRepository.deleteUser(id.data, request.company!.id, await actorId(request.principal!.sub));
  });
}
