import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const previousSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

describe('Company management routes', () => {
  it('identifies required company fields missing from the provisioning request', async () => {
    process.env.JWT_SECRET = 'test-secret-with-more-than-32-bytes';
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/companies/management',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().errors.map((error: { field?: string }) => error.field)).toEqual([
        'name',
        'code',
        'razon_social',
      ]);
    } finally {
      await app.close();
    }
  });

  it('documents the error responses returned by company management operations', async () => {
    process.env.JWT_SECRET = 'test-secret-with-more-than-32-bytes';
    const app = await buildApp();

    try {
      const document = await app.inject({ method: 'GET', url: '/docs/json' });
      expect(document.statusCode).toBe(200);
      const paths = document.json().paths;

      expect(paths['/api/v1/companies/management'].post.responses['422']).toBeDefined();
      expect(paths['/api/v1/companies/management'].post.responses['503']).toBeDefined();
      expect(paths['/api/v1/companies/management'].post.requestBody).toBeDefined();
      expect(paths['/api/v1/companies/management/{id}/database'].post.responses['201']).toBeDefined();
      expect(paths['/api/v1/companies/management/{id}/database'].post.requestBody).toBeDefined();
      expect(paths['/api/v1/companies/management/{id}'].put.responses['422']).toBeDefined();
      expect(paths['/api/v1/companies/management/{id}'].delete.responses['503']).toBeDefined();
    } finally {
      await app.close();
    }
  });
});
