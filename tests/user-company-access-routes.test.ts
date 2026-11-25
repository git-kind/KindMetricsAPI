import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listUserCompanyAccess, replaceUserCompanyAccess } = vi.hoisted(() => ({
  listUserCompanyAccess: vi.fn(),
  replaceUserCompanyAccess: vi.fn(),
}));

vi.mock('../src/Repositories/UserCompanyAccessRepository.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../src/Repositories/UserCompanyAccessRepository.js')
  >();
  return { ...actual, listUserCompanyAccess, replaceUserCompanyAccess };
});

import { buildApp } from '../src/app.js';

const previousSecret = process.env.JWT_SECRET;
const userGuid = 'b0a7d56a-9204-4d35-8ac3-a721f237d0be';

afterEach(() => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret-with-more-than-32-bytes';
});

describe('company user access management routes', () => {
  it.each(['Editor', 'Viewer'] as const)(
    'does not allow %s to read or change company assignments',
    async (role) => {
      const app = await buildApp();

      try {
        const token = app.jwt.sign({
          sub: `${role.toLowerCase()}-guid`,
          platformAdmin: false,
          role,
        });
        const headers = { authorization: `Bearer ${token}` };
        const getResponse = await app.inject({
          method: 'GET',
          url: '/api/v1/companies/management/user-access',
          headers,
        });
        const putResponse = await app.inject({
          method: 'PUT',
          url: `/api/v1/companies/management/user-access/${userGuid}`,
          headers,
          payload: { companyIds: [11] },
        });

        expect(getResponse.statusCode).toBe(403);
        expect(putResponse.statusCode).toBe(403);
        expect(listUserCompanyAccess).not.toHaveBeenCalled();
        expect(replaceUserCompanyAccess).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    },
  );

  it('allows Admin to list and update company assignments', async () => {
    const user = {
      guid: userGuid,
      name: 'Usuario Admin',
      email: 'admin@example.com',
      perfil: 'Admin' as const,
      companyIds: [11],
    };
    listUserCompanyAccess.mockResolvedValue({
      users: [user],
      companies: [{ id: 11, name: 'Empresa Uno', code: 'UNO' }],
    });
    replaceUserCompanyAccess.mockResolvedValue(user);
    const app = await buildApp();

    try {
      const token = app.jwt.sign({
        sub: 'admin-guid',
        platformAdmin: true,
        role: 'Admin',
      });
      const headers = { authorization: `Bearer ${token}` };
      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/companies/management/user-access',
        headers,
      });
      const putResponse = await app.inject({
        method: 'PUT',
        url: `/api/v1/companies/management/user-access/${userGuid}`,
        headers,
        payload: { companyIds: [11] },
      });

      expect(getResponse.statusCode).toBe(200);
      expect(putResponse.statusCode).toBe(200);
      expect(replaceUserCompanyAccess).toHaveBeenCalledWith(userGuid, [11]);
    } finally {
      await app.close();
    }
  });
});
