import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { handleApiError } from '../src/Middleware/ErrorHandler.js';

describe('database connection errors', () => {
  it('returns a clear 503 instead of exposing the socket error', async () => {
    const app = Fastify({ logger: false });
    app.setErrorHandler(handleApiError);
    app.get('/login', async () => {
      throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), {
        code: 'ECONNREFUSED',
      });
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/login' });
      const body = response.json();

      expect(response.statusCode).toBe(503);
      expect(body).toMatchObject({
        success: false,
        message: 'No se pudo conectar con la base de datos. Verifica que MySQL esté iniciado y que el host y puerto sean correctos.',
        errors: [{ code: 'DATABASE_UNAVAILABLE' }],
      });
      expect(response.body).not.toContain('ECONNREFUSED');
    } finally {
      await app.close();
    }
  });
});
