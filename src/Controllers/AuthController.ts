import type { FastifyInstance } from 'fastify';
import { loginSchema } from '../Models/Common.js';
import { AuthService } from '../Services/AuthService.js';
import { authenticate } from '../Middleware/Security.js';
const service = new AuthService();
export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', { schema: { tags: ['Auth'], body: loginSchema } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_BODY' });
    const user = await service.login(parsed.data.email, parsed.data.password);
    if (!user) return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    const token = app.jwt.sign({ sub: user.sub, platformAdmin: user.platformAdmin }, { expiresIn: '15m' });
    return { accessToken: token, tokenType: 'Bearer', expiresIn: 900, user: { guid: user.sub, email: user.email, name: user.name } };
  });
  app.get('/auth/me', { preHandler: [authenticate], schema: { tags: ['Auth'], security: [{ bearerAuth: [] }] } }, async (request) => service.me(request.principal!.sub));
}
