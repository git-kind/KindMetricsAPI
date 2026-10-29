import type { RowDataPacket } from 'mysql2';
import type { CompanyContext } from '../../Models/Common.js';
import type {
  CreateDashboardPanelDto,
  DashboardPanelResponseDto,
  MoveDashboardPanelDto,
  UpdateDashboardPanelDto,
} from '../../Models/Dashboards/DashboardPanelDto.js';
import { CompanyDatabaseRepository } from '../CompanyDatabaseRepository.js';

type PanelRow = RowDataPacket & Record<string, unknown>;

function parseConfig(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  return JSON.parse(value) as unknown;
}

function toPanel(row: PanelRow): DashboardPanelResponseDto {
  const date = (value: unknown) => (value == null ? null : new Date(value as string | Date).toISOString());
  return {
    id: Number(row.id),
    guid: String(row.guid),
    tabId: Number(row.tab_id),
    title: String(row.title),
    description: row.description == null ? null : String(row.description),
    panelType: row.panel_type as DashboardPanelResponseDto['panelType'],
    dashboardProcedureGuid: row.dashboard_procedure_guid == null ? null : String(row.dashboard_procedure_guid),
    procedureParams: parseConfig(row.procedure_params) as DashboardPanelResponseDto['procedureParams'],
    executionTimeoutSeconds: Number(row.execution_timeout_seconds ?? 30),
    status: row.status as 'ACTIVE' | 'INACTIVE',
    gridX: Number(row.grid_x),
    gridY: Number(row.grid_y),
    gridW: Number(row.grid_w),
    gridH: Number(row.grid_h),
    minW: Number(row.min_w),
    minH: Number(row.min_h),
    maxW: row.max_w == null ? null : Number(row.max_w),
    maxH: row.max_h == null ? null : Number(row.max_h),
    sortOrder: Number(row.sort_order),
    isCollapsed: Boolean(row.is_collapsed),
    isLocked: Boolean(row.is_locked),
    isVisible: Boolean(row.is_visible),
    isResizable: Boolean(row.is_resizable),
    isDraggable: Boolean(row.is_draggable),
    visualizationConfig: parseConfig(row.visualization_config) as DashboardPanelResponseDto['visualizationConfig'],
    queryConfig: parseConfig(row.query_config) as DashboardPanelResponseDto['queryConfig'],
    displayConfig: parseConfig(row.display_config) as DashboardPanelResponseDto['displayConfig'],
    version: Number(row.version),
    createdAt: date(row.created_at)!,
    createdBy: Number(row.created_by),
    updatedAt: date(row.updated_at),
    updatedBy: row.updated_by == null ? null : Number(row.updated_by),
  };
}

export class DashboardPanelsRepository {
  constructor(private readonly database = new CompanyDatabaseRepository()) {}

  async list(
    company: CompanyContext,
    dashboardGuid: string,
    tabGuid: string,
    filters: { status?: 'ACTIVE' | 'INACTIVE'; panelType?: string },
    canManage: boolean,
  ) {
    const rows = await this.database.callRows<PanelRow>(company, 'sp_dashboard_panel_list', [
      dashboardGuid,
      tabGuid,
      filters.status ?? null,
      filters.panelType ?? null,
      canManage ? 0 : 1,
    ]);
    return rows.map(toPanel);
  }

  async get(company: CompanyContext, dashboardGuid: string, tabGuid: string, panelGuid: string, canManage: boolean) {
    const row = (await this.database.callRows<PanelRow>(company, 'sp_dashboard_panel_get', [dashboardGuid, tabGuid, panelGuid]))[0];
    return row && (canManage || (row.status === 'ACTIVE' && Boolean(row.is_visible))) ? toPanel(row) : undefined;
  }

  async create(company: CompanyContext, dashboardGuid: string, tabGuid: string, input: CreateDashboardPanelDto, actor: number) {
    const rows = await this.database.callRows<PanelRow>(company, 'sp_dashboard_panel_create', [dashboardGuid, tabGuid, JSON.stringify(input), actor]);
    return rows[0] ? toPanel(rows[0]) : undefined;
  }

  async update(company: CompanyContext, dashboardGuid: string, tabGuid: string, panelGuid: string, input: UpdateDashboardPanelDto, actor: number) {
    const { expectedVersion, ...properties } = input;
    const rows = await this.database.callRows<PanelRow>(company, 'sp_dashboard_panel_update', [
      dashboardGuid,
      tabGuid,
      panelGuid,
      JSON.stringify(properties),
      expectedVersion,
      actor,
    ]);
    return rows[0] ? toPanel(rows[0]) : undefined;
  }

  async duplicate(company: CompanyContext, dashboardGuid: string, tabGuid: string, panelGuid: string, actor: number) {
    const rows = await this.database.callRows<PanelRow>(company, 'sp_dashboard_panel_duplicate', [dashboardGuid, tabGuid, panelGuid, actor]);
    return rows[0] ? toPanel(rows[0]) : undefined;
  }

  async move(company: CompanyContext, dashboardGuid: string, sourceTabGuid: string, panelGuid: string, input: MoveDashboardPanelDto, actor: number) {
    const rows = await this.database.callRows<PanelRow>(company, 'sp_dashboard_panel_move', [
      dashboardGuid,
      sourceTabGuid,
      panelGuid,
      input.targetTabGuid,
      input.gridX,
      input.gridY,
      input.expectedVersion,
      actor,
    ]);
    return rows[0] ? toPanel(rows[0]) : undefined;
  }

  async setStatus(
    company: CompanyContext,
    dashboardGuid: string,
    tabGuid: string,
    panelGuid: string,
    input: { status: 'ACTIVE' | 'INACTIVE'; expectedVersion: number },
    actor: number,
  ) {
    const rows = await this.database.callRows<PanelRow>(company, 'sp_dashboard_panel_set_status', [
      dashboardGuid,
      tabGuid,
      panelGuid,
      input.status,
      input.expectedVersion,
      actor,
    ]);
    return rows[0] ? toPanel(rows[0]) : undefined;
  }

  async delete(company: CompanyContext, dashboardGuid: string, tabGuid: string, panelGuid: string) {
    const rows = await this.database.callRows<PanelRow>(company, 'sp_dashboard_panel_delete', [dashboardGuid, tabGuid, panelGuid]);
    return Number(rows[0]?.deleted ?? 0) === 1;
  }

  async saveLayout(company: CompanyContext, dashboardGuid: string, tabGuid: string, panels: unknown, actor: number) {
    const rows = await this.database.callRows<PanelRow>(company, 'sp_dashboard_panel_save_layout', [dashboardGuid, tabGuid, JSON.stringify(panels), actor]);
    return rows.map(toPanel);
  }
}
