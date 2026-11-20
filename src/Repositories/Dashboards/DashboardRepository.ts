import type { CreateDashboardDto, DashboardFiltersDto, DashboardResponseDto, UpdateDashboardDto } from '../../Models/Dashboards/DashboardDto.js';

export interface DashboardRepository {
  list(filters: DashboardFiltersDto, includeInactive: boolean): Promise<{ dashboards: DashboardResponseDto[]; total: number }>;
  get(guid: string, includeInactive: boolean): Promise<DashboardResponseDto | undefined>;
  create(input: CreateDashboardDto, actorId: number): Promise<DashboardResponseDto>;
  update(guid: string, input: UpdateDashboardDto, actorId: number): Promise<DashboardResponseDto | undefined>;
  duplicate(
    guid: string,
    name: string | undefined,
    includePanels: boolean,
    actorId: number,
  ): Promise<DashboardResponseDto | undefined>;
  setStatus(
    guid: string,
    status: 'ACTIVE' | 'INACTIVE',
    expectedVersion: number,
    actorId: number,
  ): Promise<DashboardResponseDto | undefined>;
  delete(guid: string): Promise<boolean>;
}
