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
    procedureName: 'sp_dashboard_summary',
    procedureStatus: 'ACTIVE',
    parametersSchema: {
      schemaVersion: 1,
      parameters: [
        { name: 'p_company_id', type: 'INTEGER', required: true },
        { name: 'p_status', type: 'STRING', required: true },
        { name: 'p_service_id', type: 'STRING', required: false },
      ],
    },
    resultSchema: { schemaVersion: 1, columns: [{ name: 'total_calls', type: 'INTEGER' }] },
    procedureParams: {
      schemaVersion: 1,
      parameters: [
        { name: 'p_company_id', type: 'INTEGER', source: 'SYSTEM', systemKey: 'companyId', required: true },
        { name: 'p_status', type: 'STRING', source: 'STATIC', value: 'ACTIVE', required: true },
        { name: 'p_service_id', type: 'STRING', source: 'DASHBOARD_FILTER', filter: 'serviceId', required: true },
      ],
    },
    panelTimeoutSeconds: 30,
    procedureTimeoutSeconds: 20,
    ...overrides,
  };
}

function createService(configOverrides: Record<string, unknown> = {}, resultRows: unknown[] = [{ total_calls: 42n }]) {
  const repository = {
    getConfig: vi.fn().mockResolvedValue(config(configOverrides)),
    execute: vi.fn().mockResolvedValue([resultRows]),
  } as unknown as DashboardPanelExecutionRepository;
  return { service: new DashboardPanelExecutionService(repository), repository };
}

describe('Dashboard Panel execution', () => {
  it('resolves system and static values from trusted configuration and normalizes results', async () => {
    const { service, repository } = createService();
    const result = await service.execute(company, dashboardGuid, tabGuid, panelGuid, { serviceId: 'svc-1' }, userGuid);

    expect(repository.execute).toHaveBeenCalledWith(company, 'sp_dashboard_summary', [7, 'ACTIVE', 'svc-1'], 20);
    expect(result.rows).toEqual([{ total_calls: 42 }]);
    expect(result.columns).toEqual([{ name: 'total_calls', type: 'INTEGER' }]);
  });

  it('rejects filters not mapped by the Panel and does not execute the procedure', async () => {
    const { service, repository } = createService();

    await expect(service.execute(company, dashboardGuid, tabGuid, panelGuid, { admin: true }, userGuid)).rejects.toMatchObject({
      code: 'DASHBOARD_PANEL_FILTER_UNKNOWN',
      statusCode: 400,
    });
    expect(repository.execute).not.toHaveBeenCalled();
  });

  it('rejects missing required mapped values and inactive resources', async () => {
    const { service, repository } = createService();
    await expect(service.execute(company, dashboardGuid, tabGuid, panelGuid, {}, userGuid)).rejects.toMatchObject({
      code: 'DASHBOARD_PANEL_PARAMETER_REQUIRED',
    });

    const inactive = createService({ status: 'INACTIVE' });
    await expect(inactive.service.execute(company, dashboardGuid, tabGuid, panelGuid, {}, userGuid)).rejects.toMatchObject({
      code: 'DASHBOARD_PANEL_NOT_FOUND',
    });
    expect(repository.execute).not.toHaveBeenCalled();
  });
});