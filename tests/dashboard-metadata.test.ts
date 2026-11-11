import { describe, expect, it, vi } from 'vitest';
import type { CompanyContext } from '../src/Models/Common.js';
import type { DashboardMetadataRepository } from '../src/Repositories/DashboardMetadataRepository.js';
import { DashboardMetadataService } from '../src/Services/DashboardMetadataService.js';

const company: CompanyContext = { id: 17, guid: 'e23c9c24-39ba-48cf-9f22-4fc6a52ff3dd', code: 'DEV' };
const procedure = {
  procedureName: 'sp_dash_summary',
  securityType: 'INVOKER' as const,
  executable: true,
  parameters: [],
};

function previewExecution(
  resultSets: Array<Array<Record<string, unknown>>>,
  columns: Array<{ name: string; type: 'STRING' | 'NUMBER' | 'INTEGER' | 'DATE' | 'DATETIME' }> = [],
) {
  return { resultSets, columns };
}

function createService(overrides: Partial<DashboardMetadataRepository> = {}) {
  const repository = {
    schema: vi.fn(),
    discoverProcedures: vi.fn(),
    inspectProcedure: vi.fn().mockResolvedValue(procedure),
    getActiveProcedureResultSchema: vi.fn().mockResolvedValue({
      schemaVersion: 1,
      columns: [
        { name: 'total', type: 'INTEGER' },
        { name: 'note', type: 'STRING' },
      ],
    }),
    saveInferredProcedureResultSchema: vi.fn(),
    previewProcedure: vi.fn().mockResolvedValue(previewExecution([[{ total: 15n, note: 'ok' }]])),
    ...overrides,
  } as unknown as DashboardMetadataRepository;
  return { service: new DashboardMetadataService(repository), repository };
}

describe('Dashboard metadata service', () => {
  it('validates discovered procedure parameter signatures', async () => {
    const { service } = createService();
    const valid = await service.validateProcedure(company, {
      procedureName: 'sp_dash_summary',
      parametersSchema: { schemaVersion: 1, parameters: [] },
    });
    expect(valid.valid).toBe(true);

    const mismatch = await service.validateProcedure(company, {
      procedureName: 'sp_dash_summary',
      parametersSchema: {
        schemaVersion: 1,
        parameters: [{ name: 'p_enabled', type: 'STRING', required: true }],
      },
    });
    expect(mismatch.valid).toBe(false);
    expect(mismatch.errors.length).toBeGreaterThan(0);

    const withParameters = createService({
      inspectProcedure: vi.fn().mockResolvedValue({
        ...procedure,
        parameters: [{ name: 'p_id', type: 'INTEGER', mysqlType: 'int', mode: 'IN', ordinalPosition: 1 }],
      }),
    });
    const supported = await withParameters.service.validateProcedure(company, {
      procedureName: 'sp_dash_summary',
      parametersSchema: {
        schemaVersion: 1,
        parameters: [{ name: 'p_id', type: 'INTEGER', required: true }],
      },
    });
    expect(supported.valid).toBe(true);
  });

  it('allows parameter-free DEFINER routines to validate and preview', async () => {
    const { service, repository } = createService({
      inspectProcedure: vi.fn().mockResolvedValue({ ...procedure, securityType: 'DEFINER' }),
    });
    const result = await service.validateProcedure(company, { procedureName: 'sp_dash_summary' });
    expect(result.valid).toBe(true);
    await expect(
      service.previewProcedure(company, {
        procedureName: 'sp_dash_summary',
        parameters: {},
      }),
    ).resolves.toMatchObject({ rowCount: 1 });
    expect(repository.previewProcedure).toHaveBeenCalledOnce();
  });

  it('executes named parameters in the stored procedure signature order', async () => {
    const active = createService({
      inspectProcedure: vi.fn().mockResolvedValue({
        ...procedure,
        parameters: [
          { name: 'p_tenant', type: 'STRING', mysqlType: 'varchar', mode: 'IN', ordinalPosition: 1 },
          { name: 'p_date_from', type: 'DATETIME', mysqlType: 'datetime', mode: 'IN', ordinalPosition: 2 },
          { name: 'p_date_to', type: 'DATETIME', mysqlType: 'datetime', mode: 'IN', ordinalPosition: 3 },
        ],
      }),
    });
    await expect(
      active.service.previewProcedure(company, {
        procedureName: 'sp_dash_summary',
        parameters: {
          p_date_to: '2026-11-08T23:59:59.000Z',
          p_tenant: 'All',
          p_date_from: '2026-11-01T00:00:00.000Z',
        },
      }),
    ).resolves.toMatchObject({ rowCount: 1 });
    expect(active.repository.previewProcedure).toHaveBeenCalledWith(
      company,
      'sp_dash_summary',
      ['All', '2026-11-01 00:00:00.000', '2026-11-08 23:59:59.000'],
      30,
    );
  });

  it('rejects missing, unknown, and malformed procedure parameter values', async () => {
    const active = createService({
      inspectProcedure: vi.fn().mockResolvedValue({
        ...procedure,
        parameters: [{ name: 'p_date_from', type: 'DATETIME', mysqlType: 'datetime', mode: 'IN', ordinalPosition: 1 }],
      }),
    });
    await expect(
      active.service.previewProcedure(company, {
        procedureName: 'sp_dash_summary',
        parameters: {},
      }),
    ).rejects.toMatchObject({ code: 'DASHBOARD_PROCEDURE_PARAMETER_REQUIRED', statusCode: 400 });
    await expect(
      active.service.previewProcedure(company, {
        procedureName: 'sp_dash_summary',
        parameters: { p_unknown: 'value' },
      }),
    ).rejects.toMatchObject({ code: 'DASHBOARD_PROCEDURE_PARAMETER_UNKNOWN', statusCode: 400 });
    await expect(
      active.service.previewProcedure(company, {
        procedureName: 'sp_dash_summary',
        parameters: { p_date_from: 'not-a-date' },
      }),
    ).rejects.toMatchObject({ code: 'DASHBOARD_PROCEDURE_PARAMETER_INVALID', statusCode: 400 });
    expect(active.repository.previewProcedure).not.toHaveBeenCalled();
  });

  it('returns a versioned KindMetricsDataFrame and converts bigint values safely', async () => {
    const { service, repository } = createService();
    const result = await service.previewProcedure(company, {
      procedureName: 'sp_dash_summary',
      parameters: {},
    });
    expect(repository.previewProcedure).toHaveBeenCalledWith(company, 'sp_dash_summary', [], 30);
    expect(result).toMatchObject({
      kind: 'KindMetricsDataFrame',
      version: 1,
      columns: [
        { name: 'total', type: 'INTEGER' },
        { name: 'note', type: 'STRING' },
      ],
      rows: [{ total: 15, note: 'ok' }],
      rowCount: 1,
    });
  });

  it('infers current result columns without rewriting the stored reference schema', async () => {
    const { service, repository } = createService({
      getActiveProcedureResultSchema: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        columns: [],
      }),
      previewProcedure: vi.fn().mockResolvedValue(previewExecution([[{ call_count: 7n, ratio: 1.5, label: 'daily' }]])),
    });

    const result = await service.previewProcedure(company, {
      procedureName: 'sp_dash_summary',
      parameters: {},
    });

    expect(result.columns).toEqual([
      { name: 'call_count', type: 'INTEGER' },
      { name: 'ratio', type: 'NUMBER' },
      { name: 'label', type: 'STRING' },
    ]);
    expect(repository.saveInferredProcedureResultSchema).not.toHaveBeenCalled();
  });

  it('prefers current MySQL result metadata when the procedure returns no rows', async () => {
    const { service, repository } = createService({
      getActiveProcedureResultSchema: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        columns: [{ name: 'stale_column', type: 'INTEGER' }],
      }),
      previewProcedure: vi.fn().mockResolvedValue(
        previewExecution(
          [],
          [
            { name: 'team_name', type: 'STRING' },
            { name: 'total_calls', type: 'INTEGER' },
          ],
        ),
      ),
    });

    const result = await service.previewProcedure(company, {
      procedureName: 'sp_dash_summary',
      parameters: {},
    });

    expect(result.columns).toEqual([
      { name: 'team_name', type: 'STRING' },
      { name: 'total_calls', type: 'INTEGER' },
    ]);
    expect(result.rows).toEqual([]);
    expect(repository.saveInferredProcedureResultSchema).not.toHaveBeenCalled();
  });

  it('accepts current columns and numeric types that differ from the stored result schema', async () => {
    const { service, repository } = createService({
      getActiveProcedureResultSchema: vi.fn().mockResolvedValue({
        schemaVersion: 999,
        columns: [{ name: 'stale_column', type: 'INTEGER' }],
      }),
      previewProcedure: vi.fn().mockResolvedValue(
        previewExecution(
          [[{ total: '15.75', newly_added: 'ok' }]],
          [
            { name: 'total', type: 'NUMBER' },
            { name: 'newly_added', type: 'STRING' },
          ],
        ),
      ),
    });

    const result = await service.previewProcedure(company, {
      procedureName: 'sp_dash_summary',
      parameters: {},
    });

    expect(result.columns).toEqual([
      { name: 'total', type: 'NUMBER' },
      { name: 'newly_added', type: 'STRING' },
    ]);
    expect(result.rows).toEqual([{ total: '15.75', newly_added: 'ok' }]);
    expect(repository.saveInferredProcedureResultSchema).not.toHaveBeenCalled();
  });

  it('rejects multiple result sets and results exceeding preview limits', async () => {
    const multiple = createService({ previewProcedure: vi.fn().mockResolvedValue(previewExecution([[{ value: 1 }], [{ value: 2 }]])) });
    await expect(
      multiple.service.previewProcedure(company, {
        procedureName: 'sp_dash_summary',
        parameters: {},
      }),
    ).rejects.toMatchObject({ code: 'DASHBOARD_PROCEDURE_RESULT_INVALID', statusCode: 502 });

    const oversized = createService({
      previewProcedure: vi.fn().mockResolvedValue(previewExecution([Array.from({ length: 501 }, (_, value) => ({ value }))])),
    });
    await expect(
      oversized.service.previewProcedure(company, {
        procedureName: 'sp_dash_summary',
        parameters: {},
      }),
    ).rejects.toMatchObject({ code: 'DASHBOARD_PROCEDURE_RESULT_TOO_LARGE', statusCode: 413 });
  });
});
