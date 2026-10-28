import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const originalJwtSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the refresh cookie and returns a successful response envelope', async () => {
    process.env.JWT_SECRET = 'test-secret-with-more-than-32-bytes';
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { cookie: 'refreshToken=existing-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        success: true,
        data: { loggedOut: true },
      });
      expect(response.headers['set-cookie']).toContain('refreshToken=');
      expect(response.headers['set-cookie']).toContain('Max-Age=0');
    } finally {
      await app.close();
    }
  });
});
