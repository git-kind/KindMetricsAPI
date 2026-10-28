import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { validatorCompiler, serializerCompiler, jsonSchemaTransform } from 'fastify-type-provider-zod';
import { buildSuccessResponse } from './Helpers/ResponseHelper.js';
import { handleApiError } from './Middleware/ErrorHandler.js';
import { registerApiRoutes } from './Routes/ApiRoutes.js';

function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.origin === origin && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function buildApp() {
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'] } });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32 || secret.startsWith('CHANGE_ME')) {
    throw new Error('JWT_SECRET must contain at least 32 bytes of random data');
  }
  const allowedOrigins = new Set([
    ...(process.env.CORS_ORIGIN ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    'http://localhost:9000',
    'http://localhost:9001',
    'http://127.0.0.1:9000',
    'http://127.0.0.1:9001',
  ]);
  const isDevelopment = (process.env.NODE_ENV ?? 'dev') === 'dev';
  await app.register(cors, {
    origin: (origin, callback) => {
      callback(null, !origin || allowedOrigins.has(origin) || (isDevelopment && isLocalDevelopmentOrigin(origin)));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-Guid'],
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
  await registerApiRoutes(app);
  app.setErrorHandler((error, request, reply) => handleApiError(error, request, reply));
  return app;
}
