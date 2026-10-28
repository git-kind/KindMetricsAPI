import type { FastifyInstance } from 'fastify';
import { loginRequestSchema, type LoginRequestDto } from '../Models/Auth/LoginRequestDto.js';
import type { LoginResponseDto } from '../Models/Auth/LoginResponseDto.js';
import type { CurrentUserResponseDto } from '../Models/Auth/CurrentUserResponseDto.js';
import { AuthService } from '../Services/AuthService.js';
import { authenticate } from '../Middleware/Security.js';
import { buildErrorResponse, buildSuccessResponse, createError } from '../Helpers/ResponseHelper.js';
const service = new AuthService();
export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/logout', { schema: { tags: ['Auth'] } }, async (request, reply) => {
    reply.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'prod',
      sameSite: 'lax',
      path: '/api/v1/auth',
    });
    return reply.code(200).send(buildSuccessResponse({ loggedOut: true }, request.id, 'Sesión cerrada correctamente.'));
  });

  app.post('/auth/login', { schema: { tags: ['Auth'], body: loginRequestSchema } }, async (request, reply) => {
    const parsed = loginRequestSchema.safeParse(request.body as LoginRequestDto);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => createError('VALIDATION_ERROR', issue.message, issue.path.join('.')));
      return reply.code(400).send(buildErrorResponse('Existen errores de validación.', issues, request.id));
    }
    const user = await service.login(parsed.data.email, parsed.data.password);
    if (!user) {
      return reply
        .code(401)
        .send(buildErrorResponse('Credenciales inválidas.', [createError('INVALID_CREDENTIALS', 'El correo o la contraseña son incorrectos.')], request.id));
    }
    const token = app.jwt.sign({ sub: user.sub, platformAdmin: user.platformAdmin, tokenType: 'access' }, { expiresIn: '15m' });
    const refreshToken = app.jwt.sign({ sub: user.sub, platformAdmin: user.platformAdmin, tokenType: 'refresh' }, { expiresIn: '30d' });
    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'prod',
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 30 * 24 * 60 * 60,
    });
    const payload: LoginResponseDto = {
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: 900,
      user: { guid: user.sub, email: user.email, name: user.name, platformAdmin: user.platformAdmin },
    };
    return reply.code(200).send(buildSuccessResponse(payload, request.id, 'Inicio de sesión exitoso.'));
  });
  app.post('/auth/refresh', { schema: { tags: ['Auth'] } }, async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;
    if (!refreshToken) {
      return reply
        .code(401)
        .send(buildErrorResponse('No autorizado.', [createError('UNAUTHORIZED', 'La sesión expiró. Inicia sesión nuevamente.')], request.id));
    }

    let claims: { sub: string; platformAdmin: boolean; tokenType: string };
    try {
      claims = app.jwt.verify(refreshToken);
    } catch {
      reply.clearCookie('refreshToken', { path: '/api/v1/auth' });
      return reply
        .code(401)
        .send(buildErrorResponse('No autorizado.', [createError('UNAUTHORIZED', 'La sesión expiró. Inicia sesión nuevamente.')], request.id));
    }

    if (claims.tokenType !== 'refresh') {
      reply.clearCookie('refreshToken', { path: '/api/v1/auth' });
      return reply
        .code(401)
        .send(buildErrorResponse('No autorizado.', [createError('UNAUTHORIZED', 'La sesión expiró. Inicia sesión nuevamente.')], request.id));
    }

    const user = await service.refreshSession(claims.sub);
    if (!user) {
      reply.clearCookie('refreshToken', { path: '/api/v1/auth' });
      return reply
        .code(401)
        .send(buildErrorResponse('No autorizado.', [createError('UNAUTHORIZED', 'La sesión expiró. Inicia sesión nuevamente.')], request.id));
    }

    const accessToken = app.jwt.sign({ sub: user.sub, platformAdmin: user.platformAdmin, tokenType: 'access' }, { expiresIn: '15m' });
    const rotatedRefreshToken = app.jwt.sign({ sub: user.sub, platformAdmin: user.platformAdmin, tokenType: 'refresh' }, { expiresIn: '30d' });
    reply.setCookie('refreshToken', rotatedRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'prod',
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 30 * 24 * 60 * 60,
    });
    return reply.code(200).send(
      buildSuccessResponse(
        {
          accessToken,
          tokenType: 'Bearer',
          expiresIn: 900,
          user: {
            guid: user.sub,
            email: user.email,
            name: user.name,
            platformAdmin: user.platformAdmin,
          },
        },
        request.id,
        'Sesión renovada correctamente.',
      ),
    );
  });
  app.get('/auth/me', { preHandler: [authenticate], schema: { tags: ['Auth'], security: [{ bearerAuth: [] }] } }, async (request, reply) => {
    const user = await service.me(request.principal!.sub);
    if (!user) {
      return reply
        .code(404)
        .send(buildErrorResponse('Usuario no encontrado.', [createError('USER_NOT_FOUND', 'El usuario autenticado no existe.')], request.id));
    }
    const payload: CurrentUserResponseDto = { guid: user.guid, email: user.email, name: user.name, platformAdmin: user.platformAdmin };
    return reply.code(200).send(buildSuccessResponse(payload, request.id, 'Perfil cargado correctamente.'));
  });
}
