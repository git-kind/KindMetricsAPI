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
  it('synchronizes existing parameter-free procedures regardless of SQL security mode', async () => {
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
          parameters: [{ name: 'p_id' }],
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
      syncNoParameterProcedure: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
    } as unknown as DashboardProcedureRepository;
    const service = new DashboardProceduresService(repository, metadataRepository);

    await service.list(company, 42);

    expect(repository.syncNoParameterProcedure).toHaveBeenCalledTimes(2);
    expect(repository.syncNoParameterProcedure).toHaveBeenCalledWith(company, 'sp_dash_no_args', 42);
    expect(repository.syncNoParameterProcedure).toHaveBeenCalledWith(company, 'sp_dash_definer', 42);
    expect(repository.list).toHaveBeenCalledWith(company, true);
  });
});
