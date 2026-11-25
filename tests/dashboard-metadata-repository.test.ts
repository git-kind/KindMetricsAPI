import { describe, expect, it, vi } from 'vitest';
import type { CompanyContext } from '../src/Models/Common.js';
import type { CompanyDatabaseRepository } from '../src/Repositories/CompanyDatabaseRepository.js';
import type { KindTechDatabaseRepository } from '../src/Repositories/KindTechDatabaseRepository.js';
import { DashboardMetadataRepository } from '../src/Repositories/DashboardMetadataRepository.js';

const company: CompanyContext = {
  id: 8,
  guid: 'e23c9c24-39ba-48cf-9f22-4fc6a52ff3dd',
  code: 'DEV',
};

describe('Dashboard metadata repository', () => {
  it('logs the selected database and request ID while inspecting an unavailable procedure', async () => {
    const companyDatabase = {
      logConnection: vi.fn().mockResolvedValue(undefined),
      queryRows: vi.fn().mockResolvedValue([]),
    } as unknown as CompanyDatabaseRepository;
    const catalogDatabase = {
      logConnection: vi.fn(),
    } as unknown as KindTechDatabaseRepository;
    const repository = new DashboardMetadataRepository(companyDatabase, catalogDatabase);

    await expect(repository.inspectProcedure(company, 'sp_dash_missing', 'req-1m')).resolves.toBeUndefined();

    expect(companyDatabase.logConnection).toHaveBeenCalledWith(
      company,
      'Inspecting dashboard procedure',
      'req-1m',
    );
    expect(catalogDatabase.logConnection).not.toHaveBeenCalled();
  });

  it('discovers and previews procedures in the selected company database', async () => {
    const companyDatabase = {
      queryRows: vi.fn().mockResolvedValueOnce([
        { routine_name: 'sp_dash_Teams_Calls', security_type: 'INVOKER' },
      ]).mockResolvedValueOnce([]),
      executeReadOnlyProcedureWithMetadata: vi.fn().mockResolvedValue({
        resultSets: [[]],
        columns: [],
      }),
    } as unknown as CompanyDatabaseRepository;
    const catalogDatabase = {
      queryRows: vi.fn().mockResolvedValue([]),
    } as unknown as KindTechDatabaseRepository;
    const repository = new DashboardMetadataRepository(
      companyDatabase,
      catalogDatabase,
    );

    await expect(repository.discoverProcedures(company)).resolves.toMatchObject([
      { procedureName: 'sp_dash_Teams_Calls', securityType: 'INVOKER' },
    ]);
    await repository.previewProcedure(company, 'sp_dash_Teams_Calls', [], 30);

    expect(companyDatabase.queryRows).toHaveBeenCalledTimes(2);
    expect(companyDatabase.queryRows).toHaveBeenCalledWith(
      company,
      expect.stringContaining('information_schema.ROUTINES'),
    );
    expect(companyDatabase.executeReadOnlyProcedureWithMetadata).toHaveBeenCalledWith(
      company,
      'sp_dash_Teams_Calls',
      [],
      30,
    );
    expect(catalogDatabase.queryRows).not.toHaveBeenCalled();
  });

  it('discovers and previews central procedures in the KindTech database', async () => {
    const centralCompany: CompanyContext = {
      id: 0,
      guid: '00000000-0000-4000-8000-000000000000',
      code: 'k1ndt3ch',
    };
    const companyDatabase = {
      queryRows: vi.fn(),
      executeReadOnlyProcedureWithMetadata: vi.fn(),
    } as unknown as CompanyDatabaseRepository;
    const catalogDatabase = {
      queryRows: vi.fn().mockResolvedValueOnce([
        { routine_name: 'sp_dash_Central', security_type: 'DEFINER' },
      ]).mockResolvedValueOnce([]),
      executeReadOnlyProcedureWithMetadata: vi.fn().mockResolvedValue({
        resultSets: [[]],
        columns: [],
      }),
    } as unknown as KindTechDatabaseRepository;
    const repository = new DashboardMetadataRepository(
      companyDatabase,
      catalogDatabase,
    );

    await expect(repository.discoverProcedures(centralCompany)).resolves.toMatchObject([
      { procedureName: 'sp_dash_Central', securityType: 'DEFINER' },
    ]);
    await repository.previewProcedure(centralCompany, 'sp_dash_Central', [], 30);

    expect(companyDatabase.queryRows).not.toHaveBeenCalled();
    expect(companyDatabase.executeReadOnlyProcedureWithMetadata).not.toHaveBeenCalled();
    expect(catalogDatabase.queryRows).toHaveBeenCalledTimes(2);
    expect(catalogDatabase.queryRows).toHaveBeenCalledWith(
      centralCompany,
      expect.stringContaining('information_schema.ROUTINES'),
    );
    expect(catalogDatabase.executeReadOnlyProcedureWithMetadata).toHaveBeenCalledWith(
      centralCompany,
      'sp_dash_Central',
      [],
      30,
    );
  });

  it('persists inferred result columns in the central procedure catalog', async () => {
    const companyDatabase = {} as CompanyDatabaseRepository;
    const catalogDatabase = {
      execute: vi.fn().mockResolvedValue({ affectedRows: 1 }),
    } as unknown as KindTechDatabaseRepository;
    const repository = new DashboardMetadataRepository(companyDatabase, catalogDatabase);
    const resultSchema = {
      schemaVersion: 1 as const,
      columns: [{ name: 'Total Calls', type: 'INTEGER' }],
    };

    await repository.saveInferredProcedureResultSchema(company, 'sp_dash_Teams_Calls', resultSchema);

    expect(catalogDatabase.execute).toHaveBeenCalledWith(company, expect.stringContaining('UPDATE dashboard_procedures'), [
      JSON.stringify(resultSchema),
      'sp_dash_Teams_Calls',
    ]);
    expect(catalogDatabase.execute).toHaveBeenCalledWith(company, expect.stringContaining("status = 'ACTIVE'"), expect.any(Array));
  });

  it('reports when the active catalog entry cannot be updated', async () => {
    const catalogDatabase = {
      execute: vi.fn().mockResolvedValue({ affectedRows: 0 }),
    } as unknown as KindTechDatabaseRepository;
    const repository = new DashboardMetadataRepository(
      {} as CompanyDatabaseRepository,
      catalogDatabase,
    );

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
