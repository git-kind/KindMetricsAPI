import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  companyAccess: vi.fn(),
  getCompanyManagementUserProfile: vi.fn(),
  resolveCompanyByCode: vi.fn(),
  listDashboards: vi.fn(),
}));

vi.mock('../src/Repositories/StoredProcedures/AuthRepository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/Repositories/StoredProcedures/AuthRepository.js')>();
  return { ...actual, companyAccess: mocks.companyAccess };
});

vi.mock('../src/Repositories/CompanyManagementRepository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/Repositories/CompanyManagementRepository.js')>();
  return {
    ...actual,
    getCompanyManagementUserProfile: mocks.getCompanyManagementUserProfile,
    resolveCompanyByCode: mocks.resolveCompanyByCode,
  };
});

vi.mock('../src/Controllers/DashboardsController.js', () => ({
  dashboardsController: {
    list: mocks.listDashboards,
  },
}));

import { buildApp } from '../src/app.js';
import { AppError } from '../src/Errors/AppError.js';

const previousSecret = process.env.JWT_SECRET;
const authorizedCompanyGuid = '123e4567-e89b-12d3-a456-426614174008';
const otherCompanyGuid = '123e4567-e89b-12d3-a456-426614174009';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret-with-more-than-32-bytes';
  mocks.resolveCompanyByCode.mockImplementation(async (code: string) => ({
    id: code === 'AUTHORIZED' ? 8 : 9,
    guid: code === 'AUTHORIZED' ? authorizedCompanyGuid : otherCompanyGuid,
    code,
    status: 'ACTIVE',
  }));
  mocks.companyAccess.mockImplementation(async (_userGuid: string, companyGuid: string) =>
    companyGuid === authorizedCompanyGuid ? { id: 8 } : undefined,
  );
  mocks.getCompanyManagementUserProfile.mockResolvedValue('Editor');
  mocks.listDashboards.mockImplementation(async (request, reply) => reply.code(200).send({
    success: true,
    message: 'Dashboards obtenidos correctamente.',
    data: [],
    errors: [],
    meta: { requestId: request.id },
  }));
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

describe('Dashboard tenant authorization', () => {
  it('allows Editor dashboard access across active companies without changing other access checks', async () => {
    const app = await buildApp();

    try {
      const token = app.jwt.sign({ sub: 'user-guid', platformAdmin: false, role: 'Editor' });
      const authorized = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboards',
        headers: {
          authorization: 'Bearer ' + token,
          'x-company-code': 'AUTHORIZED',
        },
      });
      const otherActiveCompany = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboards',
        headers: {
          authorization: 'Bearer ' + token,
          'x-company-code': 'OTHER',
        },
      });

      expect(authorized.statusCode).toBe(200);
      expect(otherActiveCompany.statusCode).toBe(200);
      expect(mocks.companyAccess).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('continues requiring company assignment for Viewer dashboards', async () => {
    const app = await buildApp();

    try {
      mocks.getCompanyManagementUserProfile.mockResolvedValue('Viewer');
      const token = app.jwt.sign({ sub: 'viewer-guid', platformAdmin: false, role: 'Viewer' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboards',
        headers: {
          authorization: 'Bearer ' + token,
          'x-company-code': 'OTHER',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().errors[0].code).toBe('COMPANY_ACCESS_DENIED');
      expect(mocks.companyAccess).toHaveBeenCalledWith(
        'viewer-guid',
        otherCompanyGuid,
      );
    } finally {
      await app.close();
    }
  });

  it('returns the standard API error envelope for company database failures', async () => {
    mocks.listDashboards.mockRejectedValueOnce(
      new AppError('Company database connection failed.', {
        statusCode: 503,
        code: 'COMPANY_DATABASE_CREDENTIALS_INVALID',
      }),
    );
    const app = await buildApp();

    try {
      const token = app.jwt.sign({ sub: 'user-guid', platformAdmin: false, role: 'Editor' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboards',
        headers: {
          authorization: 'Bearer ' + token,
          'x-company-code': 'AUTHORIZED',
        },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        success: false,
        data: null,
        errors: [{ code: 'COMPANY_DATABASE_CREDENTIALS_INVALID' }],
      });
    } finally {
      await app.close();
    }
  });
});
