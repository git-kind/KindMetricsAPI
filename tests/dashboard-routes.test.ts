import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const previousSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

describe('Dashboard routes', () => {
  it('documents the dashboard endpoints and requires authentication and company context', async () => {
    process.env.JWT_SECRET = 'test-secret-with-more-than-32-bytes';
    const app = await buildApp();

    try {
      const document = await app.inject({ method: 'GET', url: '/docs/json' });
      expect(document.statusCode).toBe(200);
      const openapi = document.json();
      expect(openapi.paths['/api/v1/dashboards']).toBeDefined();
      expect(openapi.paths['/api/v1/dashboards/{guid}/duplicate']).toBeDefined();
      expect(openapi.paths['/api/v1/dashboards/{dashboardGuid}/tabs']).toBeDefined();
      expect(openapi.paths['/api/v1/dashboards/{dashboardGuid}/tabs/{tabGuid}/panels']).toBeDefined();
      expect(openapi.paths['/api/v1/dashboards/{dashboardGuid}/tabs/{tabGuid}/panels/{panelGuid}/execute']).toBeDefined();
      expect(openapi.paths['/api/v1/dashboards/{dashboardGuid}/tabs/{tabGuid}/panels/layout']).toBeDefined();
      expect(openapi.paths['/api/v1/dashboard-procedures'].get).toBeDefined();
      expect(openapi.paths['/api/v1/dashboard-procedures/{guid}'].patch).toBeDefined();
      expect(openapi.paths['/api/v1/dashboards/{dashboardGuid}/tabs'].get.responses['200']).toBeDefined();
      expect(openapi.components.securitySchemes.companyCode.name).toBe('x-company-code');

      const unauthenticated = await app.inject({ method: 'GET', url: '/api/v1/dashboards' });
      expect(unauthenticated.statusCode).toBe(401);

      const token = app.jwt.sign({ sub: 'platform-user', platformAdmin: true });
      const missingCompany = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboards',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(missingCompany.statusCode).toBe(400);
      expect(missingCompany.json().errors[0].code).toBe('COMPANY_CODE_REQUIRED');
    } finally {
      await app.close();
    }
  });
});
