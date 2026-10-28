import { AppError } from '../Errors/AppError.js';
import type { CompanyContext } from '../Models/Common.js';
import type { CreateDashboardDto, DashboardFiltersDto, UpdateDashboardDto } from '../Models/Dashboards/DashboardDto.js';
import type { DashboardRepository } from '../Repositories/Dashboards/DashboardRepository.js';
import { MySqlDashboardRepository } from '../Repositories/Dashboards/MySqlDashboardRepository.js';

export class DashboardsService {
  constructor(private readonly repository: DashboardRepository = new MySqlDashboardRepository()) {}

  list(company: CompanyContext, filters: DashboardFiltersDto, canManage: boolean) {
    const effectiveFilters = canManage ? filters : { ...filters, status: 'ACTIVE' as const };
    return this.repository.list(company, effectiveFilters, canManage);
  }

  async get(company: CompanyContext, guid: string, canManage: boolean) {
    const dashboard = await this.repository.get(company, guid, canManage);
    if (!dashboard) {
      throw new AppError('El Dashboard solicitado no existe.', {
        statusCode: 404,
        code: 'DASHBOARD_NOT_FOUND',
      });
    }
    return dashboard;
  }

  create(company: CompanyContext, input: CreateDashboardDto, actorId: number) {
    return this.repository.create(company, input, actorId);
  }

  async update(company: CompanyContext, guid: string, input: UpdateDashboardDto, actorId: number) {
    const dashboard = await this.repository.update(company, guid, input, actorId);
    if (!dashboard) {
      throw new AppError('El Dashboard solicitado no existe.', {
        statusCode: 404,
        code: 'DASHBOARD_NOT_FOUND',
      });
    }
    return dashboard;
  }

  async duplicate(company: CompanyContext, guid: string, name: string | undefined, includePanels: boolean, actorId: number) {
    const dashboard = await this.repository.duplicate(company, guid, name, includePanels, actorId);
    if (!dashboard) {
      throw new AppError('El Dashboard solicitado no existe.', {
        statusCode: 404,
        code: 'DASHBOARD_NOT_FOUND',
      });
    }
    return dashboard;
  }

  async setStatus(company: CompanyContext, guid: string, status: 'ACTIVE' | 'INACTIVE', expectedVersion: number, actorId: number) {
    const dashboard = await this.repository.setStatus(company, guid, status, expectedVersion, actorId);
    if (!dashboard) {
      throw new AppError('El Dashboard solicitado no existe.', {
        statusCode: 404,
        code: 'DASHBOARD_NOT_FOUND',
      });
    }
    return dashboard;
  }

  async delete(company: CompanyContext, guid: string) {
    if (!(await this.repository.delete(company, guid))) {
      throw new AppError('El Dashboard solicitado no existe.', {
        statusCode: 404,
        code: 'DASHBOARD_NOT_FOUND',
      });
    }
  }
}
