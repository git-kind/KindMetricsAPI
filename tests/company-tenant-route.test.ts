import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  companyAccess: vi.fn(),
  getCompanyManagementUserProfile: vi.fn(),
  resolveCompanyByCode: vi.fn(),
  listDashboards: vi.fn(),
  metadataSchema: vi.fn(),
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

vi.mock('../src/Controllers/DashboardMetadataController.js', () => ({
  dashboardMetadataController: {
    schema: mocks.metadataSchema,
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
  mocks.getCompanyManagementUserProfile.mockResolvedValue('Visor');
  mocks.listDashboards.mockImplementation(async (request, reply) => reply.code(200).send({
    success: true,
    message: 'Dashboards obtenidos correctamente.',
    data: [],
    errors: [],
    meta: { requestId: request.id },
  }));
  mocks.metadataSchema.mockImplementation(async (request, reply) => reply.code(200).send({
    success: true,
    message: 'Metadata loaded.',
    data: { tables: [], columns: [], indexes: [], relationships: [] },
    errors: [],
    meta: { requestId: request.id },
  }));
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

describe('Dashboard central database routing', () => {
  it('continues past the synchronous KindTech context hook into the metadata handler', async () => {
    const app = await buildApp();

    try {
      const token = app.jwt.sign({ sub: 'user-guid', platformAdmin: false });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard-metadata/schema',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(mocks.metadataSchema).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it('does not require or authorize a company code for the central Dashboard list', async () => {
    const app = await buildApp();

    try {
      const token = app.jwt.sign({ sub: 'user-guid', platformAdmin: false });
      const withoutCompanyCode = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboards',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      const withCompanyCode = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboards',
        headers: {
          authorization: `Bearer ${token}`,
          'x-company-code': 'OTHER',
        },
      });

      expect(withoutCompanyCode.statusCode).toBe(200);
      expect(withCompanyCode.statusCode).toBe(200);
      expect(mocks.companyAccess).not.toHaveBeenCalled();
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
      const token = app.jwt.sign({ sub: 'user-guid', platformAdmin: false });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboards',
        headers: {
          authorization: `Bearer ${token}`,
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
