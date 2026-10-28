import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const originalEnvironment = {
  jwtSecret: process.env.JWT_SECRET,
  nodeEnv: process.env.NODE_ENV,
};

afterEach(() => {
  if (originalEnvironment.jwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalEnvironment.jwtSecret;
  }

  if (originalEnvironment.nodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalEnvironment.nodeEnv;
  }
});

describe('CORS configuration', () => {
  it('allows local development preflight requests for PATCH and company headers', async () => {
    process.env.JWT_SECRET = 'test-secret-with-more-than-32-bytes';
    process.env.NODE_ENV = 'dev';
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/companies',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'PATCH',
          'access-control-request-headers': 'authorization,x-company-code',
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(response.headers['access-control-allow-methods']).toContain('PATCH');
      expect(response.headers['access-control-allow-headers']).toContain('X-Company-Code');
    } finally {
      await app.close();
    }
  });

  it('does not allow non-local development origins unless explicitly configured', async () => {
    process.env.JWT_SECRET = 'test-secret-with-more-than-32-bytes';
    process.env.NODE_ENV = 'dev';
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/companies',
        headers: {
          origin: 'https://untrusted.example',
          'access-control-request-method': 'GET',
        },
      });

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
