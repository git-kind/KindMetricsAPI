import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPool: vi.fn(),
  callStoredProcedure: vi.fn(),
  executeReadOnlyProcedureWithMetadata: vi.fn(),
  getExecutorDatabaseName: vi.fn(),
}));

vi.mock('../src/Services/CompanyConnectionService.js', () => ({
  companyConnectionService: { getPool: mocks.getPool },
}));

vi.mock('../src/Database/SqlExecutor.js', () => ({
  callStoredProcedure: mocks.callStoredProcedure,
  executeReadOnlyProcedureWithMetadata: mocks.executeReadOnlyProcedureWithMetadata,
  getExecutorDatabaseName: mocks.getExecutorDatabaseName,
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
    mocks.getPool.mockResolvedValue({ database: 'pozolito' });
    mocks.getExecutorDatabaseName.mockReturnValue('pozolito');
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

  it('reports when an authorized dashboard procedure is missing from the company database', async () => {
    mocks.executeReadOnlyProcedureWithMetadata.mockRejectedValue({
      code: 'ER_SP_DOES_NOT_EXIST',
    });

    await expect(
      repository.executeReadOnlyProcedureWithMetadata(
        company,
        'sp_dash_Missing',
        [],
        30,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'COMPANY_DASHBOARD_PROCEDURE_NOT_FOUND',
      message: 'El procedimiento autorizado no existe en la base de datos de la empresa.',
      cause: { databaseName: 'pozolito' },
    });
  });

  it('preserves unrelated stored procedure errors', async () => {
    const error = new Error('Stored procedure failed');
    mocks.callStoredProcedure.mockRejectedValue(error);

    await expect(repository.callRows(company, 'sp_dashboard_list')).rejects.toBe(error);
  });
});
