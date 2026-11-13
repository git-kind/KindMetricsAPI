import { describe, expect, it } from 'vitest';
import { createDashboardSchema, dashboardFiltersSchema, duplicateDashboardSchema, updateDashboardSchema } from '../src/Models/Dashboards/DashboardDto.js';
import { createDashboardTabSchema, reorderDashboardTabsSchema } from '../src/Models/Dashboards/DashboardTabDto.js';
import { createDashboardPanelSchema, saveDashboardPanelLayoutSchema } from '../src/Models/Dashboards/DashboardPanelDto.js';
import { executeDashboardPanelSchema } from '../src/Models/Dashboards/DashboardPanelDto.js';
import { createDashboardProcedureSchema, updateDashboardProcedureSchema } from '../src/Models/DashboardProcedures/DashboardProcedureDto.js';
import { dashboardProcedurePreviewSchema, dashboardSchemaQuerySchema } from '../src/Models/DashboardMetadata/DashboardMetadataDto.js';

describe('Dashboard DTOs', () => {
  it('validates Company metadata filters and preview procedure inputs', () => {
    expect(dashboardSchemaQuerySchema.safeParse({ tableName: 'dashboard_panels' }).success).toBe(true);
    expect(dashboardSchemaQuerySchema.safeParse({ tableName: 'panels; DROP TABLE users' }).success).toBe(false);
    expect(
      dashboardProcedurePreviewSchema.safeParse({
        procedureName: 'sp_dash_summary',
        parameters: {},
      }).success,
    ).toBe(true);
    expect(
      dashboardProcedurePreviewSchema.safeParse({
        procedureName: 'sp_dash_AVG_Calls_Duration',
      }).success,
    ).toBe(true);
    expect(
      dashboardProcedurePreviewSchema.safeParse({
        procedureName: 'sp_dash_summary',
        parameters: { p_id: 1 },
      }).success,
    ).toBe(true);
    expect(dashboardProcedurePreviewSchema.safeParse({ procedureName: 'sp_dashboard_summary' }).success).toBe(false);
    expect(
      dashboardProcedurePreviewSchema.safeParse({
        procedureName: 'sp_dash_summary',
        parameters: { p_range: { query: 'unexpected' } },
      }).success,
    ).toBe(false);
  });

  it('accepts only dashboard properties on create', () => {
    expect(createDashboardSchema.safeParse({ name: ' Overview ', tags: [' ops '] }).data).toEqual({
      name: 'Overview',
      tags: ['ops'],
      refreshEnabled: false,
      refreshIntervalSeconds: 30,
    });
    expect(createDashboardSchema.safeParse({ name: 'Overview', time_from: 'now-1h' }).success).toBe(false);
  });

  it('accepts the frontend PANEL payload with procedure parameters and display presets', () => {
    const payload = {
      title: 'Llamadas en Teams',
      description: null,
      panelType: 'PANEL',
      dashboardProcedureGuid: '433b093b-dbd9-11f1-a1c1-cac863731861',
      procedureParams: {
        schemaVersion: 1,
        parameters: [
          { name: 'p_tenant', type: 'STRING', source: 'STATIC', value: 'All', required: true },
          { name: 'p_date_from', type: 'DATETIME', source: 'DASHBOARD_FILTER', required: true, filter: 'dateFrom' },
          { name: 'p_date_to', type: 'DATETIME', source: 'DASHBOARD_FILTER', required: true, filter: 'dateTo' },
        ],
      },
      executionTimeoutSeconds: 30,
      gridX: 0,
      gridY: 0,
      gridW: 6,
      gridH: 3,
      minW: 2,
      minH: 2,
      sortOrder: 0,
      isVisible: true,
      isResizable: true,
      isDraggable: true,
      visualizationConfig: {
        schemaVersion: 1,
        properties: {
          columns: 2,
          rows: 1,
          cells: [
            { id: 'cell-1', title: 'Metric 1', source: 'FIELD', field: 'Total Calls', format: 'number', decimals: 0, conditions: [] },
            { id: 'cell-2', title: 'Metric 2', source: 'FIELD', field: 'PSTN', format: 'number', decimals: 0, conditions: [] },
          ],
        },
      },
      displayConfig: {
        schemaVersion: 1,
        properties: {
          visualizationPresets: {
            LINE: { xField: '', yFields: [], legend: false },
            PANEL: {
              columns: 2,
              rows: 1,
              cells: [
                { id: 'cell-1', title: 'Metric 1', source: 'FIELD', field: 'Total Calls', format: 'number', decimals: 0, conditions: [] },
                { id: 'cell-2', title: 'Metric 2', source: 'FIELD', field: 'PSTN', format: 'number', decimals: 0, conditions: [] },
              ],
            },
          },
        },
      },
    };

    expect(createDashboardPanelSchema.safeParse(payload).success).toBe(true);
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
    expect(createDashboardPanelSchema.safeParse({ ...textPanel, panelType: 'NUMBER', dashboardProcedureGuid: null }).success).toBe(false);
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

  it('accepts built-in and custom BAR styles while rejecting invalid custom colors', () => {
    const barPanel = {
      title: 'Calls by day',
      panelType: 'BAR',
      gridX: 0,
      gridY: 0,
      gridW: 6,
      gridH: 3,
      dashboardProcedureGuid: 'b6f7a16e-fbd5-4cfb-976c-63b41852fa2a',
      procedureParams: { schemaVersion: 1, parameters: [] },
      visualizationConfig: {
        schemaVersion: 1,
        properties: {
          xField: 'day',
          yFields: ['total_calls'],
          barStyle: 'purple',
          barWidthPercent: 70,
          barCategoryGapPercent: 25,
          xAxisLabelRotate: 45,
        },
      },
    };

    expect(createDashboardPanelSchema.safeParse(barPanel).success).toBe(true);
    expect(
      createDashboardPanelSchema.safeParse({
        ...barPanel,
        visualizationConfig: {
          ...barPanel.visualizationConfig,
          properties: {
            ...barPanel.visualizationConfig.properties,
            barStyle: 'custom',
            barCustomColor: '#4388D4',
          },
        },
      }).success,
    ).toBe(true);
    expect(
      createDashboardPanelSchema.safeParse({
        ...barPanel,
        visualizationConfig: {
          ...barPanel.visualizationConfig,
          properties: {
            ...barPanel.visualizationConfig.properties,
            barStyle: 'custom',
            barCustomColor: 'url(javascript:alert(1))',
          },
        },
      }).success,
    ).toBe(false);
    expect(
      createDashboardPanelSchema.safeParse({
        ...barPanel,
        visualizationConfig: {
          ...barPanel.visualizationConfig,
          properties: {
            ...barPanel.visualizationConfig.properties,
            barStyle: 'unknown',
          },
        },
      }).success,
    ).toBe(false);
    expect(
      createDashboardPanelSchema.safeParse({
        ...barPanel,
        visualizationConfig: {
          ...barPanel.visualizationConfig,
          properties: {
            ...barPanel.visualizationConfig.properties,
            barWidthPercent: 120,
          },
        },
      }).success,
    ).toBe(false);
    expect(
      createDashboardPanelSchema.safeParse({
        ...barPanel,
        visualizationConfig: {
          ...barPanel.visualizationConfig,
          properties: {
            ...barPanel.visualizationConfig.properties,
            xAxisLabelRotate: -15,
          },
        },
      }).success,
    ).toBe(false);
    expect(
      createDashboardPanelSchema.safeParse({
        ...barPanel,
        visualizationConfig: {
          ...barPanel.visualizationConfig,
          properties: {
            ...barPanel.visualizationConfig.properties,
            barCategoryGapPercent: 95,
          },
        },
      }).success,
    ).toBe(false);
  });

  it('accepts Time Series line, bar, and point modes with bounded options', () => {
    const timeSeriesPanel = {
      title: 'Calls over time',
      panelType: 'TIME_SERIES',
      gridX: 0,
      gridY: 0,
      gridW: 6,
      gridH: 3,
      dashboardProcedureGuid: 'b6f7a16e-fbd5-4cfb-976c-63b41852fa2a',
      procedureParams: { schemaVersion: 1, parameters: [] },
      visualizationConfig: {
        schemaVersion: 1,
        properties: {
          xField: 'timestamp',
          yFields: ['total_calls'],
          chartMode: 'lines',
          interpolation: 'smooth',
          lineWidth: 2,
          fillOpacity: 19,
          gradientMode: 'opacity',
          lineStyle: 'dashed',
        },
      },
    };

    expect(createDashboardPanelSchema.safeParse(timeSeriesPanel).success).toBe(true);
    for (const chartMode of ['lines', 'bars', 'points']) {
      expect(
        createDashboardPanelSchema.safeParse({
          ...timeSeriesPanel,
          visualizationConfig: {
            ...timeSeriesPanel.visualizationConfig,
            properties: {
              ...timeSeriesPanel.visualizationConfig.properties,
              chartMode,
            },
          },
        }).success,
      ).toBe(true);
    }
    expect(
      createDashboardPanelSchema.safeParse({
        ...timeSeriesPanel,
        visualizationConfig: {
          ...timeSeriesPanel.visualizationConfig,
          properties: {
            ...timeSeriesPanel.visualizationConfig.properties,
            chartMode: 'unknown',
          },
        },
      }).success,
    ).toBe(false);
    expect(
      createDashboardPanelSchema.safeParse({
        ...timeSeriesPanel,
        visualizationConfig: {
          ...timeSeriesPanel.visualizationConfig,
          properties: {
            ...timeSeriesPanel.visualizationConfig.properties,
            pointSize: 21,
          },
        },
      }).success,
    ).toBe(false);
  });

  it('accepts future visualization identifiers with bounded generic JSON config', () => {
    const futurePanel = {
      title: 'Custom visualization',
      panelType: 'CUSTOM_TIMELINE_V2',
      gridX: 0,
      gridY: 0,
      gridW: 6,
      gridH: 3,
      dashboardProcedureGuid: 'b6f7a16e-fbd5-4cfb-976c-63b41852fa2a',
      procedureParams: { schemaVersion: 1, parameters: [] },
      visualizationConfig: {
        schemaVersion: 1,
        properties: { xField: 'time', customOption: { mode: 'gradient' } },
      },
    };

    expect(createDashboardPanelSchema.safeParse(futurePanel).success).toBe(true);
    expect(
      createDashboardPanelSchema.safeParse({
        ...futurePanel,
        panelType: 'custom-timeline',
      }).success,
    ).toBe(false);
    expect(
      createDashboardPanelSchema.safeParse({
        ...futurePanel,
        panelType: 'A'.repeat(41),
      }).success,
    ).toBe(false);
  });

  it('accepts a bounded Panel grid and rejects mismatched cells and unsafe colors', () => {
    const gridPanel = {
      title: 'Call metrics',
      panelType: 'PANEL',
      gridX: 0,
      gridY: 0,
      gridW: 6,
      gridH: 3,
      dashboardProcedureGuid: 'b6f7a16e-fbd5-4cfb-976c-63b41852fa2a',
      procedureParams: { schemaVersion: 1, parameters: [] },
      visualizationConfig: {
        schemaVersion: 1,
        properties: {
          columns: 2,
          rows: 1,
          cells: [
            {
              id: 'calls',
              title: 'Calls',
              source: 'FIELD',
              field: 'total_calls',
              format: 'number',
              decimals: 0,
              conditions: [
                {
                  expression: '[total_calls]',
                  operator: 'GT',
                  value: 100,
                  backgroundColor: '#FEE2E2',
                  textColor: '#991B1B',
                },
              ],
            },
            {
              id: 'rate',
              title: 'Call rate',
              source: 'FORMULA',
              formula: '[total_calls] / 60',
              format: 'number',
              decimals: 2,
            },
          ],
        },
      },
    };

    expect(createDashboardPanelSchema.safeParse(gridPanel).success).toBe(true);
    expect(
      createDashboardPanelSchema.safeParse({
        ...gridPanel,
        visualizationConfig: {
          ...gridPanel.visualizationConfig,
          properties: { ...gridPanel.visualizationConfig.properties, columns: 3 },
        },
      }).success,
    ).toBe(false);
    expect(
      createDashboardPanelSchema.safeParse({
        ...gridPanel,
        visualizationConfig: {
          ...gridPanel.visualizationConfig,
          properties: {
            ...gridPanel.visualizationConfig.properties,
            cells: [
              { ...gridPanel.visualizationConfig.properties.cells[0], backgroundColor: 'url(javascript:alert(1))' },
              gridPanel.visualizationConfig.properties.cells[1],
            ],
          },
        },
      }).success,
    ).toBe(false);
  });

  it('validates panel execution filters and procedure parameter contracts', () => {
    expect(executeDashboardPanelSchema.parse({ filters: { dateFrom: '2026-10-01', serviceId: 'svc-1' } })).toMatchObject({
      filters: { dateFrom: '2026-10-01', serviceId: 'svc-1' },
    });
    expect(executeDashboardPanelSchema.safeParse({ filters: { 'bad filter': 'x' } }).success).toBe(false);
    expect(executeDashboardPanelSchema.safeParse({ filters: {}, procedureName: 'sp_dashboard_any' }).success).toBe(false);

    const catalogEntry = {
      procedureName: 'sp_dash_calls_summary',
      parametersSchema: { schemaVersion: 1, parameters: [] },
      resultSchema: { schemaVersion: 1, columns: [{ name: 'total_calls', type: 'INTEGER' }] },
    };
    expect(createDashboardProcedureSchema.safeParse(catalogEntry).success).toBe(true);
    expect(
      createDashboardProcedureSchema.safeParse({
        ...catalogEntry,
        procedureName: 'sp_dash_AVG_Calls_Duration',
      }).success,
    ).toBe(true);
    expect(
      createDashboardProcedureSchema.safeParse({
        ...catalogEntry,
        parametersSchema: {
          schemaVersion: 1,
          parameters: [{ name: 'p_range', type: 'STRING', required: true }],
        },
      }).success,
    ).toBe(true);
    expect(createDashboardProcedureSchema.safeParse({ ...catalogEntry, procedureName: 'sp_dashboard_calls_summary' }).success).toBe(false);
    expect(createDashboardProcedureSchema.safeParse({ ...catalogEntry, procedureName: 'sp_user_admin' }).success).toBe(false);
    expect(updateDashboardProcedureSchema.safeParse({ status: 'ACTIVE', expectedVersion: 1 }).success).toBe(true);
    expect(
      updateDashboardProcedureSchema.safeParse({
        parametersSchema: {
          schemaVersion: 1,
          parameters: [{ name: 'p_range', type: 'STRING', required: true }],
        },
        expectedVersion: 1,
      }).success,
    ).toBe(true);
  });
});
