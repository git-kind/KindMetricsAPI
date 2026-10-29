import { describe, expect, it, vi } from 'vitest';
import type { CompanyContext } from '../src/Models/Common.js';
import { createDashboardPanelSchema, updateDashboardPanelSchema } from '../src/Models/Dashboards/DashboardPanelDto.js';
import type { DashboardPanelsRepository } from '../src/Repositories/Dashboards/DashboardPanelsRepository.js';
import type { DashboardProcedureRepository } from '../src/Repositories/DashboardProcedures/DashboardProcedureRepository.js';
import { DashboardPanelsService } from '../src/Services/DashboardPanelsService.js';

const company: CompanyContext = { id: 7, guid: 'e23c9c24-39ba-48cf-9f22-4fc6a52ff3dd', code: 'DEV' };
const dashboardGuid = '94e4562a-0f47-420f-963d-f137fa7b8858';
const tabGuid = '117a615c-e7f0-4c6a-9bcb-6d89239fa7cb';
const panelGuid = 'a52c3b4e-bb4f-4da9-8d56-91508d8ac9fd';
const procedureGuid = '379cdbb6-251a-4a2d-b6d2-8e648943693a';

const procedure = {
  status: 'ACTIVE',
  parametersSchema: { schemaVersion: 1, parameters: [{ name: 'p_service_id', type: 'STRING', required: true }] },
};
const parameterMapping = {
  schemaVersion: 1,
  parameters: [{ name: 'p_service_id', type: 'STRING', source: 'DASHBOARD_FILTER', filter: 'serviceId', required: true }],
};
const visualizationConfig = { schemaVersion: 1 as const, properties: { valueField: 'total_calls' } };

describe('Dashboard Panel Service', () => {
  it('rejects procedure mappings that differ from the active catalog contract', async () => {
    const panelsRepository = { create: vi.fn() } as unknown as DashboardPanelsRepository;
    const proceduresRepository = { get: vi.fn().mockResolvedValue(procedure) } as unknown as DashboardProcedureRepository;
    const service = new DashboardPanelsService(panelsRepository, proceduresRepository);
    const input = createDashboardPanelSchema.parse({
      title: 'Calls',
      panelType: 'NUMBER',
      dashboardProcedureGuid: procedureGuid,
      procedureParams: {
        schemaVersion: 1,
        parameters: [{ name: 'p_other', type: 'STRING', source: 'DASHBOARD_FILTER', filter: 'serviceId', required: true }],
      },
      visualizationConfig,
      gridX: 0,
      gridY: 0,
      gridW: 6,
      gridH: 4,
    });

    await expect(service.create(company, dashboardGuid, tabGuid, input, 11)).rejects.toMatchObject({
      code: 'DASHBOARD_PANEL_PARAMETER_CONTRACT_MISMATCH',
    });
    expect(panelsRepository.create).not.toHaveBeenCalled();
  });

  it('allows a visualization-only update when it matches the persisted Panel type', async () => {
    const currentPanel = {
      guid: panelGuid,
      panelType: 'NUMBER',
      dashboardProcedureGuid: procedureGuid,
      procedureParams: parameterMapping,
      visualizationConfig,
    };
    const panelsRepository = {
      get: vi.fn().mockResolvedValue(currentPanel),
      update: vi.fn().mockResolvedValue(currentPanel),
    } as unknown as DashboardPanelsRepository;
    const proceduresRepository = { get: vi.fn().mockResolvedValue(procedure) } as unknown as DashboardProcedureRepository;
    const service = new DashboardPanelsService(panelsRepository, proceduresRepository);
    const input = updateDashboardPanelSchema.parse({
      visualizationConfig: { schemaVersion: 1, properties: { valueField: 'completed_calls', decimals: 0 } },
      expectedVersion: 1,
    });

    await expect(service.update(company, dashboardGuid, tabGuid, panelGuid, input, 11)).resolves.toBe(currentPanel);
    expect(panelsRepository.update).toHaveBeenCalledOnce();
  });
});