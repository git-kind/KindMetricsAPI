import { describe, expect, it, vi } from 'vitest';
import type { CompanyContext } from '../src/Models/Common.js';
import type { CompanyDatabaseRepository } from '../src/Repositories/CompanyDatabaseRepository.js';
import { DashboardMetadataRepository } from '../src/Repositories/DashboardMetadataRepository.js';

const company: CompanyContext = {
  id: 8,
  guid: 'e23c9c24-39ba-48cf-9f22-4fc6a52ff3dd',
  code: 'DEV',
};

describe('Dashboard metadata repository', () => {
  it('persists inferred result columns without depending on a company stored procedure', async () => {
    const database = {
      execute: vi.fn().mockResolvedValue({ affectedRows: 1 }),
    } as unknown as CompanyDatabaseRepository;
    const repository = new DashboardMetadataRepository(database);
    const resultSchema = {
      schemaVersion: 1 as const,
      columns: [{ name: 'Total Calls', type: 'INTEGER' }],
    };

    await repository.saveInferredProcedureResultSchema(company, 'sp_dash_Teams_Calls', resultSchema);

    expect(database.execute).toHaveBeenCalledWith(company, expect.stringContaining('UPDATE dashboard_procedures'), [
      JSON.stringify(resultSchema),
      'sp_dash_Teams_Calls',
    ]);
    expect(database.execute).toHaveBeenCalledWith(company, expect.stringContaining("status = 'ACTIVE'"), expect.any(Array));
  });

  it('reports when the active catalog entry cannot be updated', async () => {
    const database = {
      execute: vi.fn().mockResolvedValue({ affectedRows: 0 }),
    } as unknown as CompanyDatabaseRepository;
    const repository = new DashboardMetadataRepository(database);

    await expect(
      repository.saveInferredProcedureResultSchema(company, 'sp_dash_Teams_Calls', {
        schemaVersion: 1,
        columns: [{ name: 'Total Calls', type: 'INTEGER' }],
      }),
    ).rejects.toMatchObject({
      code: 'DASHBOARD_PROCEDURE_NOT_ACTIVE',
      statusCode: 409,
    });
  });
});
