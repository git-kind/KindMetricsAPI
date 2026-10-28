import type { RowDataPacket } from 'mysql2';
import type { CompanyContext } from '../../Models/Common.js';
import type {
  CreateDashboardTabDto,
  DashboardTabResponseDto,
  DuplicateDashboardTabDto,
  ReorderDashboardTabsDto,
  SetDashboardTabStatusDto,
  UpdateDashboardTabDto,
} from '../../Models/Dashboards/DashboardTabDto.js';
import { CompanyDatabaseRepository } from '../CompanyDatabaseRepository.js';

type TabRow = RowDataPacket & Record<string, unknown>;

function toTab(row: TabRow): DashboardTabResponseDto {
  const date = (value: unknown) => (value == null ? null : new Date(value as string | Date).toISOString());
  return {
    id: Number(row.id),
    guid: String(row.guid),
    dashboardId: Number(row.dashboard_id),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    sortOrder: Number(row.sort_order),
    status: row.status as 'ACTIVE' | 'INACTIVE',
    isDefault: Boolean(row.is_default),
    version: Number(row.version),
    createdAt: date(row.created_at)!,
    createdBy: Number(row.created_by),
    updatedAt: date(row.updated_at),
    updatedBy: row.updated_by == null ? null : Number(row.updated_by),
    ...(row.panel_count === undefined ? {} : { panelCount: Number(row.panel_count) }),
  };
}

export class DashboardTabsRepository {
  constructor(private readonly database = new CompanyDatabaseRepository()) {}

  async list(company: CompanyContext, dashboardGuid: string, status: 'ACTIVE' | 'INACTIVE' | undefined, canManage: boolean) {
    const rows = await this.database.callRows<TabRow>(company, 'sp_dashboard_tab_list', [dashboardGuid, status ?? null]);
    return rows.filter((row) => canManage || row.status === 'ACTIVE').map(toTab);
  }

  async get(company: CompanyContext, dashboardGuid: string, tabGuid: string, canManage: boolean) {
    const row = (await this.database.callRows<TabRow>(company, 'sp_dashboard_tab_get', [dashboardGuid, tabGuid]))[0];
    return row && (canManage || row.status === 'ACTIVE') ? toTab(row) : undefined;
  }

  async create(company: CompanyContext, dashboardGuid: string, input: CreateDashboardTabDto, actor: number) {
    const rows = await this.database.callRows<TabRow>(company, 'sp_dashboard_tab_create', [dashboardGuid, input.name, input.description ?? null, actor]);
    return rows[0] ? toTab(rows[0]) : undefined;
  }

  async update(company: CompanyContext, dashboardGuid: string, tabGuid: string, input: UpdateDashboardTabDto, actor: number) {
    const { expectedVersion, ...properties } = input;
    const rows = await this.database.callRows<TabRow>(company, 'sp_dashboard_tab_update', [
      dashboardGuid,
      tabGuid,
      JSON.stringify(properties),
      expectedVersion,
      actor,
    ]);
    return rows[0] ? toTab(rows[0]) : undefined;
  }

  async duplicate(company: CompanyContext, dashboardGuid: string, tabGuid: string, input: DuplicateDashboardTabDto, actor: number) {
    const rows = await this.database.callRows<TabRow>(company, 'sp_dashboard_tab_duplicate', [
      dashboardGuid,
      tabGuid,
      input.name ?? null,
      input.includePanels ? 1 : 0,
      actor,
    ]);
    return rows[0] ? toTab(rows[0]) : undefined;
  }

  async reorder(company: CompanyContext, dashboardGuid: string, input: ReorderDashboardTabsDto, actor: number) {
    const rows = await this.database.callRows<TabRow>(company, 'sp_dashboard_tab_reorder', [dashboardGuid, JSON.stringify(input.tabs), actor]);
    return rows.map(toTab);
  }

  async setDefault(company: CompanyContext, dashboardGuid: string, tabGuid: string, actor: number) {
    const rows = await this.database.callRows<TabRow>(company, 'sp_dashboard_tab_set_default', [dashboardGuid, tabGuid, actor]);
    return rows[0] ? toTab(rows[0]) : undefined;
  }

  async setStatus(company: CompanyContext, dashboardGuid: string, tabGuid: string, input: SetDashboardTabStatusDto, actor: number) {
    const rows = await this.database.callRows<TabRow>(company, 'sp_dashboard_tab_set_status', [
      dashboardGuid,
      tabGuid,
      input.status,
      input.expectedVersion,
      actor,
    ]);
    return rows[0] ? toTab(rows[0]) : undefined;
  }

  async delete(company: CompanyContext, dashboardGuid: string, tabGuid: string) {
    const rows = await this.database.callRows<TabRow>(company, 'sp_dashboard_tab_delete', [dashboardGuid, tabGuid]);
    return Number(rows[0]?.deleted ?? 0) === 1;
  }
}
