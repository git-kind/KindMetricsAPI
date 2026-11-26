import { describe, expect, it, vi } from 'vitest';
import type { CompanyContext } from '../src/Models/Common.js';
import type { DashboardMetadataRepository } from '../src/Repositories/DashboardMetadataRepository.js';
import type { DashboardProcedureRepository } from '../src/Repositories/DashboardProcedures/DashboardProcedureRepository.js';
import { DashboardProceduresService } from '../src/Services/DashboardProceduresService.js';

vi.mock('../src/Repositories/StoredProcedures/ActorRepository.js', () => ({
  actorId: vi.fn().mockResolvedValue(42),
}));

const company: CompanyContext = {
  id: 8,
  guid: 'e23c9c24-39ba-48cf-9f22-4fc6a52ff3dd',
  code: 'DEV',
};

describe('Dashboard procedures service', () => {
  it('synchronizes executable procedures with their discovered input parameters', async () => {
    const metadataRepository = {
      discoverProcedures: vi.fn().mockResolvedValue([
        {
          procedureName: 'sp_dash_no_args',
          securityType: 'INVOKER',
          executable: true,
          parameters: [],
        },
        {
          procedureName: 'sp_dash_with_args',
          securityType: 'INVOKER',
          executable: true,
          parameters: [
            { name: 'p_tenant', type: 'STRING', mode: 'IN', ordinalPosition: 1 },
            { name: 'p_date_from', type: 'DATETIME', mode: 'IN', ordinalPosition: 2 },
          ],
        },
        {
          procedureName: 'sp_dash_with_output',
          securityType: 'INVOKER',
          executable: false,
          parameters: [{ name: 'p_result', type: 'STRING', mode: 'OUT', ordinalPosition: 1 }],
        },
        {
          procedureName: 'sp_dash_definer',
          securityType: 'DEFINER',
          executable: true,
          parameters: [],
        },
      ]),
    } as unknown as DashboardMetadataRepository;
    const repository = {
      syncDiscoveredProcedure: vi.fn(),
      list: vi.fn().mockResolvedValue([
        { procedureName: 'sp_dash_no_args', status: 'ACTIVE' },
        { procedureName: 'sp_dash_with_args', status: 'ACTIVE' },
        { procedureName: 'sp_dash_with_output', status: 'ACTIVE' },
        { procedureName: 'sp_dash_definer', status: 'ACTIVE' },
        { procedureName: 'sp_dash_other_company_only', status: 'ACTIVE' },
      ]),
    } as unknown as DashboardProcedureRepository;
    const service = new DashboardProceduresService(repository, metadataRepository);

    const result = await service.list(company, 'user-guid');

    expect(repository.syncDiscoveredProcedure).toHaveBeenCalledTimes(3);
    expect(repository.syncDiscoveredProcedure).toHaveBeenCalledWith(
      company,
      'sp_dash_no_args',
      {
        schemaVersion: 1,
        parameters: [],
      },
      42,
    );
    expect(repository.syncDiscoveredProcedure).toHaveBeenCalledWith(
      company,
      'sp_dash_with_args',
      {
        schemaVersion: 1,
        parameters: [
          { name: 'p_tenant', type: 'STRING', required: true },
          { name: 'p_date_from', type: 'DATETIME', required: true },
        ],
      },
      42,
    );
    expect(repository.syncDiscoveredProcedure).toHaveBeenCalledWith(
      company,
      'sp_dash_definer',
      {
        schemaVersion: 1,
        parameters: [],
      },
      42,
    );
    expect(repository.list).toHaveBeenCalledWith(company, true);
    expect(result.map((procedure) => procedure.procedureName)).toEqual([
      'sp_dash_no_args',
      'sp_dash_with_args',
      'sp_dash_definer',
    ]);
  });

  it('reports the missing dashboard procedure id migration clearly', async () => {
    const metadataRepository = {
      discoverProcedures: vi.fn().mockResolvedValue([
        {
          procedureName: 'sp_dash_with_args',
          securityType: 'INVOKER',
          executable: true,
          parameters: [
            { name: 'p_date_from', type: 'DATETIME', mode: 'IN', ordinalPosition: 1 },
            { name: 'p_region', type: 'STRING', mode: 'IN', ordinalPosition: 2 },
          ],
        },
      ]),
    } as unknown as DashboardMetadataRepository;
    const repository = {
      syncDiscoveredProcedure: vi.fn().mockRejectedValue({
        code: 'ER_NO_DEFAULT_FOR_FIELD',
        errno: 1364,
        sqlMessage: "Field 'id' doesn't have a default value",
      }),
      getCatalogConnectionDetails: vi.fn().mockReturnValue({
        database: 'kindmetrics',
        databaseUser: 'kindmetrics_api',
      }),
      list: vi.fn(),
    } as unknown as DashboardProcedureRepository;
    const service = new DashboardProceduresService(repository, metadataRepository);

    await expect(service.list(company, 'user-guid')).rejects.toMatchObject({
      statusCode: 503,
      code: 'DASHBOARD_PROCEDURE_CATALOG_MIGRATION_REQUIRED',
      message: expect.stringContaining('0012-dashboard-procedure-id-auto-increment.sql'),
      context: {
        database: 'kindmetrics',
        databaseUser: 'kindmetrics_api',
        procedureName: 'sp_dash_with_args',
        parameters: [
          { name: 'p_date_from', type: 'DATETIME', mode: 'IN' },
          { name: 'p_region', type: 'STRING', mode: 'IN' },
        ],
        companyCode: 'DEV',
      },
    });
  });
});
