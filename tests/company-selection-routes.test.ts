import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listAvailableCompanies } = vi.hoisted(() => ({
  listAvailableCompanies: vi.fn(),
}));

vi.mock('../src/Repositories/UserCompanyAccessRepository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/Repositories/UserCompanyAccessRepository.js')>();
  return { ...actual, listAvailableCompanies };
});

import { buildApp } from '../src/app.js';

const previousSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret-with-more-than-32-bytes';
});

describe('GET /api/v1/companies/available', () => {
  it('returns only the authenticated user’s available company contracts', async () => {
    listAvailableCompanies.mockResolvedValue([
      { id: 11, name: 'Empresa Uno', code: 'UNO' },
      { id: 12, name: 'Empresa Dos', code: 'DOS' },
    ]);
    const app = await buildApp();

    try {
      const token = app.jwt.sign({ sub: 'authenticated-user-guid', platformAdmin: false });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/companies/available?userGuid=other-user-guid',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual([
        { id: 11, name: 'Empresa Uno', code: 'UNO' },
        { id: 12, name: 'Empresa Dos', code: 'DOS' },
      ]);
      expect(listAvailableCompanies).toHaveBeenCalledWith('authenticated-user-guid');
    } finally {
      await app.close();
    }
  });

  it('returns an empty list when no active companies are available', async () => {
    listAvailableCompanies.mockResolvedValue([]);
    const app = await buildApp();

    try {
      const token = app.jwt.sign({ sub: 'user-without-companies', platformAdmin: false });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/companies/available',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
      expect(response.json().data).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('uses the same platform-administrator policy as company context resolution', async () => {
    listAvailableCompanies.mockResolvedValue([
      { id: 21, name: 'Empresa Global', code: 'GLOBAL' },
    ]);
    const app = await buildApp();

    try {
      const token = app.jwt.sign({ sub: 'platform-admin-guid', platformAdmin: true });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/companies/available',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual([
        { id: 21, name: 'Empresa Global', code: 'GLOBAL' },
      ]);
      expect(listAvailableCompanies).toHaveBeenCalledWith('platform-admin-guid');
    } finally {
      await app.close();
    }
  });

  it('requires authentication', async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/companies/available',
      });

      expect(response.statusCode).toBe(401);
      expect(listAvailableCompanies).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
