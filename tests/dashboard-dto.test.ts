import { describe, expect, it } from 'vitest';
import { createDashboardSchema, dashboardFiltersSchema, duplicateDashboardSchema, updateDashboardSchema } from '../src/Models/Dashboards/DashboardDto.js';
import { createDashboardTabSchema, reorderDashboardTabsSchema } from '../src/Models/Dashboards/DashboardTabDto.js';
import { createDashboardPanelSchema, saveDashboardPanelLayoutSchema } from '../src/Models/Dashboards/DashboardPanelDto.js';

describe('Dashboard DTOs', () => {
  it('accepts only dashboard properties on create', () => {
    expect(createDashboardSchema.safeParse({ name: ' Overview ', tags: [' ops '] }).data).toEqual({
      name: 'Overview',
      tags: ['ops'],
    });
    expect(createDashboardSchema.safeParse({ name: 'Overview', time_from: 'now-1h' }).success).toBe(false);
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
});
