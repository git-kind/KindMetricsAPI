import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPool: vi.fn(),
  callStoredProcedure: vi.fn(),
}));

vi.mock('../src/Services/CompanyConnectionService.js', () => ({
  companyConnectionService: { getPool: mocks.getPool },
}));

vi.mock('../src/Database/SqlExecutor.js', () => ({
  callStoredProcedure: mocks.callStoredProcedure,
}));

import { CompanyDatabaseRepository } from '../src/Repositories/CompanyDatabaseRepository.js';

describe('CompanyDatabaseRepository connection errors', () => {
  const repository = new CompanyDatabaseRepository();
  const company = {
    id: 2,
    guid: '123e4567-e89b-12d3-a456-426614174008',
    code: 'PAPITAS',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPool.mockResolvedValue({});
  });

  it('returns an actionable 503 when MySQL rejects the company credentials', async () => {
    mocks.callStoredProcedure.mockRejectedValue({
      code: 'ER_ACCESS_DENIED_ERROR',
    });

    await expect(repository.callRows(company, 'sp_dashboard_list')).rejects.toMatchObject({
      statusCode: 503,
      code: 'COMPANY_DATABASE_CREDENTIALS_INVALID',
    });
  });

  it('preserves unrelated stored procedure errors', async () => {
    const error = new Error('Stored procedure failed');
    mocks.callStoredProcedure.mockRejectedValue(error);

    await expect(repository.callRows(company, 'sp_dashboard_list')).rejects.toBe(error);
  });
});
