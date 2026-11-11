import { describe, expect, it, vi } from 'vitest';
import type { CompanyContext } from '../src/Models/Common.js';
import type { DashboardPanelExecutionRepository } from '../src/Repositories/Dashboards/DashboardPanelExecutionRepository.js';
import { DashboardPanelExecutionService } from '../src/Services/DashboardPanelExecutionService.js';

const company: CompanyContext = { id: 7, guid: 'e23c9c24-39ba-48cf-9f22-4fc6a52ff3dd', code: 'DEV' };
const dashboardGuid = '94e4562a-0f47-420f-963d-f137fa7b8858';
const tabGuid = '117a615c-e7f0-4c6a-9bcb-6d89239fa7cb';
const panelGuid = 'a52c3b4e-bb4f-4da9-8d56-91508d8ac9fd';
const userGuid = '7614a76c-c822-4c91-ad4b-5ed0a931ea8e';

function config(overrides: Record<string, unknown> = {}) {
  return {
    panelGuid,
    panelType: 'NUMBER',
    status: 'ACTIVE',
    isVisible: 1,
    dashboardStatus: 'ACTIVE',
    tabStatus: 'ACTIVE',
    dashboardProcedureGuid: '379cdbb6-251a-4a2d-b6d2-8e648943693a',
    procedureName: 'sp_dash_AVG_Calls_Duration',
    procedureStatus: 'ACTIVE',
    procedureSecurityType: 'INVOKER',
    parametersSchema: { schemaVersion: 1, parameters: [] },
    resultSchema: { schemaVersion: 1, columns: [{ name: 'total_calls', type: 'INTEGER' }] },
    procedureParams: { schemaVersion: 1, parameters: [] },
    panelTimeoutSeconds: 30,
    procedureTimeoutSeconds: 20,
    ...overrides,
  };
}

function createService(
  configOverrides: Record<string, unknown> = {},
  resultRows: unknown[] = [{ total_calls: 42n }],
  columns: Array<{ name: string; type: 'STRING' | 'NUMBER' | 'INTEGER' | 'DATE' | 'DATETIME' }> = [
    { name: 'total_calls', type: 'INTEGER' },
  ],
) {
  const repository = {
    getConfig: vi.fn().mockResolvedValue(config(configOverrides)),
    execute: vi.fn().mockResolvedValue({ resultSets: [resultRows], columns }),
  } as unknown as DashboardPanelExecutionRepository;
  return { service: new DashboardPanelExecutionService(repository), repository };
}

describe('Dashboard Panel execution', () => {
  it('executes a parameter-free procedure and normalizes results', async () => {
    const { service, repository } = createService();
    const result = await service.execute(company, dashboardGuid, tabGuid, panelGuid, {}, userGuid);

    expect(repository.execute).toHaveBeenCalledWith(company, 'sp_dash_AVG_Calls_Duration', [], 20);
    expect(result.rows).toEqual([{ total_calls: 42 }]);
    expect(result.columns).toEqual([{ name: 'total_calls', type: 'INTEGER' }]);
  });

  it('uses current result metadata instead of blocking on the stored result schema', async () => {
    const { service } = createService(
      {
        resultSchema: { oldOrInvalid: true },
      },
      [{ total_calls: '42.5', label: 'today' }],
      [
        { name: 'label', type: 'STRING' },
        { name: 'total_calls', type: 'NUMBER' },
      ],
    );

    await expect(
      service.execute(company, dashboardGuid, tabGuid, panelGuid, {}, userGuid),
    ).resolves.toMatchObject({
      columns: [
        { name: 'label', type: 'STRING' },
        { name: 'total_calls', type: 'NUMBER' },
      ],
      rows: [{ total_calls: '42.5', label: 'today' }],
    });
  });

  it('returns current result columns when a procedure has no rows', async () => {
    const { service } = createService(
      { resultSchema: { stale: true } },
      [],
      [{ name: 'new_metric', type: 'NUMBER' }],
    );

    await expect(
      service.execute(company, dashboardGuid, tabGuid, panelGuid, {}, userGuid),
    ).resolves.toMatchObject({
      columns: [{ name: 'new_metric', type: 'NUMBER' }],
      rows: [],
      rowCount: 0,
    });
  });

  it('rejects filters not mapped by the Panel and does not execute the procedure', async () => {
    const { service, repository } = createService();

    await expect(service.execute(company, dashboardGuid, tabGuid, panelGuid, { serviceId: 'svc-1' }, userGuid)).rejects.toMatchObject({
      code: 'DASHBOARD_PANEL_FILTER_UNKNOWN',
      statusCode: 400,
    });
    expect(repository.execute).not.toHaveBeenCalled();
  });

  it('rejects missing required mapped values and inactive resources', async () => {
    const { repository } = createService();
    const inactive = createService({ status: 'INACTIVE' });
    await expect(inactive.service.execute(company, dashboardGuid, tabGuid, panelGuid, {}, userGuid)).rejects.toMatchObject({
      code: 'DASHBOARD_PANEL_NOT_FOUND',
    });
    expect(repository.execute).not.toHaveBeenCalled();
  });

  it('executes parameter-free DEFINER procedures', async () => {
    const { service, repository } = createService({ procedureSecurityType: 'DEFINER' });
    await expect(service.execute(company, dashboardGuid, tabGuid, panelGuid, {}, userGuid)).resolves.toMatchObject({ rows: [{ total_calls: 42 }] });
    expect(repository.execute).toHaveBeenCalledOnce();
  });

  it('executes Panel procedure parameters using the authorized mapping', async () => {
    const parameterized = createService({
      parametersSchema: {
        schemaVersion: 1,
        parameters: [{ name: 'p_id', type: 'INTEGER', required: true }],
      },
      procedureParams: {
        schemaVersion: 1,
        parameters: [{ name: 'p_id', type: 'INTEGER', source: 'STATIC', value: 1, required: true }],
      },
    });

    await expect(parameterized.service.execute(company, dashboardGuid, tabGuid, panelGuid, {}, userGuid)).resolves.toMatchObject({
      rows: [{ total_calls: 42 }],
    });
    expect(parameterized.repository.execute).toHaveBeenCalledWith(company, 'sp_dash_AVG_Calls_Duration', [1], 20);
  });
});
