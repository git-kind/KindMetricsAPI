import type { CompanyContext } from '../../Models/Common.js';
import type { CreateDashboardDto, DashboardFiltersDto, DashboardResponseDto, UpdateDashboardDto } from '../../Models/Dashboards/DashboardDto.js';

export interface DashboardRepository {
  list(company: CompanyContext, filters: DashboardFiltersDto, includeInactive: boolean): Promise<{ dashboards: DashboardResponseDto[]; total: number }>;
  get(company: CompanyContext, guid: string, includeInactive: boolean): Promise<DashboardResponseDto | undefined>;
  create(company: CompanyContext, input: CreateDashboardDto, actorId: number): Promise<DashboardResponseDto>;
  update(company: CompanyContext, guid: string, input: UpdateDashboardDto, actorId: number): Promise<DashboardResponseDto | undefined>;
  duplicate(
    company: CompanyContext,
    guid: string,
    name: string | undefined,
    includePanels: boolean,
    actorId: number,
  ): Promise<DashboardResponseDto | undefined>;
  setStatus(
    company: CompanyContext,
    guid: string,
    status: 'ACTIVE' | 'INACTIVE',
    expectedVersion: number,
    actorId: number,
  ): Promise<DashboardResponseDto | undefined>;
  delete(company: CompanyContext, guid: string): Promise<boolean>;
}
