import { describe, expect, it } from 'vitest';
import { createDashboardSchema, dashboardFiltersSchema, duplicateDashboardSchema, updateDashboardSchema } from '../src/Models/Dashboards/DashboardDto.js';
import { createDashboardTabSchema, reorderDashboardTabsSchema } from '../src/Models/Dashboards/DashboardTabDto.js';
import { createDashboardPanelSchema, saveDashboardPanelLayoutSchema } from '../src/Models/Dashboards/DashboardPanelDto.js';
import { executeDashboardPanelSchema } from '../src/Models/Dashboards/DashboardPanelDto.js';
import { createDashboardProcedureSchema, updateDashboardProcedureSchema } from '../src/Models/DashboardProcedures/DashboardProcedureDto.js';

describe('Dashboard DTOs', () => {
  it('accepts only dashboard properties on create', () => {
    expect(createDashboardSchema.safeParse({ name: ' Overview ', tags: [' ops '] }).data).toEqual({
      name: 'Overview',
      tags: ['ops'],
      refreshEnabled: false,
      refreshIntervalSeconds: 30,
    });
    expect(createDashboardSchema.safeParse({ name: 'Overview', time_from: 'now-1h' }).success).toBe(false);
  });

  it('defaults and validates Dashboard refresh settings', () => {
    expect(createDashboardSchema.parse({ name: 'Overview' })).toMatchObject({ refreshEnabled: false, refreshIntervalSeconds: 30 });
    expect(createDashboardSchema.safeParse({ name: 'Overview', refreshIntervalSeconds: 9 }).success).toBe(false);
    expect(createDashboardSchema.safeParse({ name: 'Overview', refreshIntervalSeconds: 0 }).success).toBe(false);
    expect(updateDashboardSchema.safeParse({ expectedVersion: 1, refreshEnabled: true, refreshIntervalSeconds: 45 }).success).toBe(true);
  });

  it('distinguishes omitted values from explicit nulls on update', () => {
    const parsed = updateDashboardSchema.parse({ expectedVersion: 3, description: null, folderId: null });

    expect(parsed).toEqual({ expectedVersion: 3, description: null, folderId: null });
    expect(updateDashboardSchema.safeParse({ expectedVersion: 3 }).success).toBe(false);
  });

  it('validates pagination and permitted sort fields', () => {
    expect(dashboardFiltersSchema.parse({ page: '2', pageSize: '10', tags: 'ops, sales' })).toMatchObject({
      page: 2,
      pageSize: 10,
      tags: ['ops', 'sales'],
    });
    expect(dashboardFiltersSchema.safeParse({ sortBy: 'sql' }).success).toBe(false);
    expect(dashboardFiltersSchema.safeParse({ pageSize: '1000' }).success).toBe(false);
  });

  it('defaults dashboard duplication to omit panels and validates the explicit option', () => {
    expect(duplicateDashboardSchema.parse({})).toEqual({ includePanels: false });
    expect(duplicateDashboardSchema.parse({ includePanels: true }).includePanels).toBe(true);
    expect(duplicateDashboardSchema.safeParse({ includePanels: 'true' }).success).toBe(false);
  });

  it('validates Tab names and requires unique Tab GUIDs and sort positions', () => {
    expect(createDashboardTabSchema.safeParse({ name: ' General ' }).data).toMatchObject({ name: 'General' });
    expect(
      reorderDashboardTabsSchema.safeParse({
        tabs: [
          { guid: 'b6f7a16e-fbd5-4cfb-976c-63b41852fa2a', sortOrder: 0 },
          { guid: 'b6f7a16e-fbd5-4cfb-976c-63b41852fa2a', sortOrder: 1 },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects invalid Panel geometry and sensitive configuration properties', () => {
    expect(
      createDashboardPanelSchema.safeParse({
        title: 'Revenue',
        panelType: 'LINE',
        gridX: 10,
        gridY: 0,
        gridW: 4,
        gridH: 2,
      }).success,
    ).toBe(false);
    expect(
      createDashboardPanelSchema.safeParse({
        title: 'Revenue',
        panelType: 'LINE',
        gridX: 0,
        gridY: 0,
        gridW: 6,
        gridH: 4,
        queryConfig: { schemaVersion: 1, properties: { apiKey: 'secret' } },
      }).success,
    ).toBe(false);
    expect(
      saveDashboardPanelLayoutSchema.safeParse({
        panels: [
          { guid: 'b6f7a16e-fbd5-4cfb-976c-63b41852fa2a', gridX: 0, gridY: 0, gridW: 4, gridH: 4, expectedVersion: 1 },
          { guid: 'f53eb609-29aa-4811-bd3b-187a92661c16', gridX: 3, gridY: 0, gridW: 4, gridH: 4, expectedVersion: 1 },
        ],
      }).success,
    ).toBe(false);
  });

  it('requires an authorized procedure contract for data Panels and permits safe TEXT Panels', () => {
    const textPanel = {
      title: 'Notes',
      panelType: 'TEXT',
      gridX: 0,
      gridY: 0,
      gridW: 6,
      gridH: 4,
      visualizationConfig: { schemaVersion: 1, properties: { content: 'Operational notes' } },
    };
    expect(createDashboardPanelSchema.safeParse(textPanel).success).toBe(true);
    expect(
      createDashboardPanelSchema.safeParse({
        ...textPanel,
        visualizationConfig: { schemaVersion: 1, properties: { content: '<script>alert(1)</script>' } },
      }).success,
    ).toBe(false);
    expect(
      createDashboardPanelSchema.safeParse({ ...textPanel, panelType: 'NUMBER', dashboardProcedureGuid: null }).success,
    ).toBe(false);
    expect(
      createDashboardPanelSchema.safeParse({
        ...textPanel,
        panelType: 'NUMBER',
        dashboardProcedureGuid: 'b6f7a16e-fbd5-4cfb-976c-63b41852fa2a',
        procedureParams: { schemaVersion: 1, parameters: [] },
        visualizationConfig: { schemaVersion: 1, properties: { valueField: 'total_calls' } },
      }).success,
    ).toBe(true);
  });

  it('validates panel execution filters and requires catalog approval before activation', () => {
    expect(executeDashboardPanelSchema.parse({ filters: { dateFrom: '2026-10-01', serviceId: 'svc-1' } })).toMatchObject({
      filters: { dateFrom: '2026-10-01', serviceId: 'svc-1' },
    });
    expect(executeDashboardPanelSchema.safeParse({ filters: { 'bad filter': 'x' } }).success).toBe(false);
    expect(executeDashboardPanelSchema.safeParse({ filters: {}, procedureName: 'sp_dashboard_any' }).success).toBe(false);

    const catalogEntry = {
      procedureName: 'sp_dashboard_calls_summary',
      parametersSchema: { schemaVersion: 1, parameters: [{ name: 'p_range', type: 'STRING', required: true }] },
      resultSchema: { schemaVersion: 1, columns: [{ name: 'total_calls', type: 'INTEGER' }] },
    };
    expect(createDashboardProcedureSchema.safeParse(catalogEntry).success).toBe(true);
    expect(createDashboardProcedureSchema.safeParse({ ...catalogEntry, procedureName: 'sp_user_admin' }).success).toBe(false);
    expect(
      updateDashboardProcedureSchema.safeParse({ status: 'ACTIVE', expectedVersion: 1 }).success,
    ).toBe(false);
    expect(
      updateDashboardProcedureSchema.safeParse({ status: 'ACTIVE', approvalReference: 'SEC-42', expectedVersion: 1 }).success,
    ).toBe(true);
  });
});
