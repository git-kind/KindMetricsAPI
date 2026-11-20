import { AppError } from '../Errors/AppError.js';
import type { CreateDashboardDto, DashboardFiltersDto, UpdateDashboardDto } from '../Models/Dashboards/DashboardDto.js';
import type { DashboardRepository } from '../Repositories/Dashboards/DashboardRepository.js';
import { MySqlDashboardRepository } from '../Repositories/Dashboards/MySqlDashboardRepository.js';
import { actorId as resolveActorId } from '../Repositories/StoredProcedures/ActorRepository.js';

export class DashboardsService {
  constructor(private readonly repository: DashboardRepository = new MySqlDashboardRepository()) {}

  list(filters: DashboardFiltersDto, canManage: boolean) {
    const effectiveFilters = canManage ? filters : { ...filters, status: 'ACTIVE' as const };
    return this.repository.list(effectiveFilters, canManage);
  }

  async get(guid: string, canManage: boolean) {
    const dashboard = await this.repository.get(guid, canManage);
    if (!dashboard) {
      throw new AppError('El Dashboard solicitado no existe.', {
        statusCode: 404,
        code: 'DASHBOARD_NOT_FOUND',
      });
    }
    return dashboard;
  }

  async create(input: CreateDashboardDto, userGuid: string) {
    const actorId = await resolveActorId(userGuid);
    return this.repository.create(input, actorId);
  }

  async update(guid: string, input: UpdateDashboardDto, userGuid: string) {
    const actorId = await resolveActorId(userGuid);
    const dashboard = await this.repository.update(guid, input, actorId);
    if (!dashboard) {
      throw new AppError('El Dashboard solicitado no existe.', {
        statusCode: 404,
        code: 'DASHBOARD_NOT_FOUND',
      });
    }
    return dashboard;
  }

  async duplicate(guid: string, name: string | undefined, includePanels: boolean, userGuid: string) {
    const actorId = await resolveActorId(userGuid);
    const dashboard = await this.repository.duplicate(guid, name, includePanels, actorId);
    if (!dashboard) {
      throw new AppError('El Dashboard solicitado no existe.', {
        statusCode: 404,
        code: 'DASHBOARD_NOT_FOUND',
      });
    }
    return dashboard;
  }

  async setStatus(guid: string, status: 'ACTIVE' | 'INACTIVE', expectedVersion: number, userGuid: string) {
    const actorId = await resolveActorId(userGuid);
    const dashboard = await this.repository.setStatus(guid, status, expectedVersion, actorId);
    if (!dashboard) {
      throw new AppError('El Dashboard solicitado no existe.', {
        statusCode: 404,
        code: 'DASHBOARD_NOT_FOUND',
      });
    }
    return dashboard;
  }

  async delete(guid: string) {
    if (!(await this.repository.delete(guid))) {
      throw new AppError('El Dashboard solicitado no existe.', {
        statusCode: 404,
        code: 'DASHBOARD_NOT_FOUND',
      });
    }
  }
}
