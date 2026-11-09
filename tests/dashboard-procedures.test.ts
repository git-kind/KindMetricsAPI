import { describe, expect, it, vi } from 'vitest';
import type { CompanyContext } from '../src/Models/Common.js';
import type { DashboardMetadataRepository } from '../src/Repositories/DashboardMetadataRepository.js';
import type { DashboardProcedureRepository } from '../src/Repositories/DashboardProcedures/DashboardProcedureRepository.js';
import { DashboardProceduresService } from '../src/Services/DashboardProceduresService.js';

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
      list: vi.fn().mockResolvedValue([]),
    } as unknown as DashboardProcedureRepository;
    const service = new DashboardProceduresService(repository, metadataRepository);

    await service.list(company, 42);

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
  });
});
