import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { validatorCompiler, serializerCompiler, jsonSchemaTransform } from 'fastify-type-provider-zod';
import { authRoutes } from './Controllers/AuthController.js';
import { entityRoutes } from './Controllers/EntityController.js';
import { userRoutes } from './Controllers/UserController.js';
import { userManagementRoutes } from './Controllers/UserManagementController.js';
import { queryRoutes } from './Controllers/QueryController.js';
import { buildSuccessResponse } from './Helpers/ResponseHelper.js';
import { handleApiError } from './Middleware/ErrorHandler.js';

export async function buildApp() {
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'] } });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32 || secret.startsWith('CHANGE_ME')) {
    throw new Error('JWT_SECRET must contain at least 32 bytes of random data');
  }
  const allowedOrigins = [
    'http://localhost:9000',
    ...(process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== 'http://localhost:9000'
      ? [process.env.CORS_ORIGIN]
      : []),
  ];
  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });
  await app.register(cookie);
  await app.register(jwt, { secret });
  await app.register(swagger, {
    openapi: {
      info: { title: 'KindMetricsAPI', version: '0.1.0' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          companyGuid: { type: 'apiKey', in: 'header', name: 'X-Company-Guid' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  app.get('/health', async (request) => buildSuccessResponse({ status: 'ok' }, request.id, 'Servicio saludable.'));
  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(entityRoutes);
      await api.register(userRoutes);
      await api.register(userManagementRoutes);
      await api.register(queryRoutes);
    },
    { prefix: '/api/v1' },
  );
  app.setErrorHandler((error, request, reply) => handleApiError(error, request, reply));
  return app;
}
