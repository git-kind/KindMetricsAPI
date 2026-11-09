import { describe, expect, it, vi } from 'vitest';
import type { CompanyContext } from '../src/Models/Common.js';
import type { CompanyDatabaseRepository } from '../src/Repositories/CompanyDatabaseRepository.js';
import { DashboardProcedureRepository } from '../src/Repositories/DashboardProcedures/DashboardProcedureRepository.js';

const company: CompanyContext = {
  id: 8,
  guid: 'e23c9c24-39ba-48cf-9f22-4fc6a52ff3dd',
  code: 'DEV',
};

describe('Dashboard procedure repository', () => {
  it('synchronizes discovered procedures directly without relying on a stale SQL routine', async () => {
    const database = {
      queryRows: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 4,
            guid: '93aa4067-5f29-46a1-a1e9-86f496ac4527',
            procedure_name: 'sp_dash_AVG_Calls_Duration',
            description: null,
            parameters_schema: { schemaVersion: 1, parameters: [{ name: 'p_tenant', type: 'STRING', required: true }] },
            result_schema: { schemaVersion: 1, columns: [] },
            status: 'ACTIVE',
            execution_timeout_seconds: 30,
            version: 1,
            created_at: new Date('2026-11-06T12:00:00Z'),
            created_by: 42,
            updated_at: null,
            updated_by: null,
            reviewed_by: null,
            approval_reference: null,
          },
        ])
        .mockResolvedValueOnce([]),
    } as unknown as CompanyDatabaseRepository;
    const repository = new DashboardProcedureRepository(database);
    const parametersSchema = {
      schemaVersion: 1 as const,
      parameters: [{ name: 'p_tenant', type: 'STRING', required: true }],
    };

    const result = await repository.syncDiscoveredProcedure(company, 'sp_dash_AVG_Calls_Duration', parametersSchema, 42);

    expect(result?.procedureName).toBe('sp_dash_AVG_Calls_Duration');
    expect(database.queryRows).toHaveBeenCalledTimes(2);
    const [, syncSql, syncParams] = vi.mocked(database.queryRows).mock.calls[0]!;
    expect(syncSql).toContain('INSERT INTO dashboard_procedures');
    expect(syncSql).toContain('FROM information_schema.ROUTINES');
    expect(syncSql).toContain('FROM information_schema.PARAMETERS');
    expect(syncSql).toContain('JSON_TABLE');
    expect(syncSql).toContain("actual.DATA_TYPE NOT IN ('datetime','timestamp')");
    expect(syncSql).not.toContain('SECURITY_TYPE');
    expect(syncSql).not.toContain('CALL sp_dashboard_procedure_sync_no_parameter');
    expect(syncParams).toEqual([
      'sp_dash_AVG_Calls_Duration',
      JSON.stringify(parametersSchema),
      42,
      'sp_dash_AVG_Calls_Duration',
      'sp_dash_AVG_Calls_Duration',
      JSON.stringify(parametersSchema),
      'sp_dash_AVG_Calls_Duration',
      JSON.stringify(parametersSchema),
      JSON.stringify(parametersSchema),
      'sp_dash_AVG_Calls_Duration',
      'sp_dash_AVG_Calls_Duration',
      42,
    ]);

    await repository.list(company, true);

    const [, listSql] = vi.mocked(database.queryRows).mock.calls[2]!;
    expect(listSql).toContain('FROM dashboard_procedures');
    expect(listSql).not.toContain('CALL sp_dashboard_procedure_list');
  });
});
