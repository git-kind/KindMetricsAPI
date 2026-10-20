import type { FastifyInstance } from 'fastify';
import { loginSchema } from '../Models/Common.js';
import { AuthService } from '../Services/AuthService.js';
import { authenticate } from '../Middleware/Security.js';
import { buildErrorResponse, buildSuccessResponse, createError } from '../Helpers/ResponseHelper.js';
const service = new AuthService();
export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', { schema: { tags: ['Auth'], body: loginSchema } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => createError('VALIDATION_ERROR', issue.message, issue.path.join('.')));
      return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues, request.id));
    }
    const user = await service.login(parsed.data.email, parsed.data.password);
    if (!user) {
      return reply.code(401).send(buildErrorResponse('Credenciales inválidas.', [createError('INVALID_CREDENTIALS', 'El correo o la contraseña son incorrectos.')], request.id));
    }
    const token = app.jwt.sign({ sub: user.sub, platformAdmin: user.platformAdmin }, { expiresIn: '15m' });
    const payload = { accessToken: token, tokenType: 'Bearer', expiresIn: 900, user: { guid: user.sub, email: user.email, name: user.name } };
    return reply.code(200).send(buildSuccessResponse(payload, request.id, 'Inicio de sesión exitoso.'));
  });
  app.get('/auth/me', { preHandler: [authenticate], schema: { tags: ['Auth'], security: [{ bearerAuth: [] }] } }, async (request, reply) => {
    const user = await service.me(request.principal!.sub);
    return reply.code(200).send(buildSuccessResponse(user, request.id, 'Perfil cargado correctamente.'));
  });
}
