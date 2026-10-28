import { AppError } from '../Errors/AppError.js';
import type { CompanyContext } from '../Models/Common.js';
import type {
  CreateDashboardTabDto,
  DuplicateDashboardTabDto,
  ReorderDashboardTabsDto,
  SetDashboardTabStatusDto,
  UpdateDashboardTabDto,
} from '../Models/Dashboards/DashboardTabDto.js';
import { DashboardTabsRepository } from '../Repositories/Dashboards/DashboardTabsRepository.js';

function persistenceError(error: unknown): never {
  const message = error && typeof error === 'object' && 'sqlMessage' in error && typeof error.sqlMessage === 'string' ? error.sqlMessage : '';
  if (message.includes('VERSION_CONFLICT'))
    throw new AppError('El recurso fue modificado por otra operación.', { statusCode: 409, code: 'DASHBOARD_VERSION_CONFLICT' });
  if (message.includes('DASHBOARD_TAB_NOT_FOUND')) throw new AppError('La Tab solicitada no existe.', { statusCode: 404, code: 'DASHBOARD_TAB_NOT_FOUND' });
  if (message.includes('DASHBOARD_NOT_FOUND')) throw new AppError('El Dashboard solicitado no existe.', { statusCode: 404, code: 'DASHBOARD_NOT_FOUND' });
  if (message.includes('DASHBOARD_TAB_') || message.includes('ACTIVE_DASHBOARD_TAB'))
    throw new AppError('La operación no cumple las reglas de Tabs o tiene dependencias.', { statusCode: 409, code: 'DASHBOARD_TAB_CONFLICT' });
  if (message.includes('INVALID_DASHBOARD_')) throw new AppError('Los datos de Tab no son válidos.', { statusCode: 400, code: 'INVALID_DASHBOARD_TAB' });
  throw error;
}

export class DashboardTabsService {
  constructor(private readonly repository = new DashboardTabsRepository()) {}

  async list(company: CompanyContext, dashboard: string, status: 'ACTIVE' | 'INACTIVE' | undefined, canManage: boolean) {
    try {
      return await this.repository.list(company, dashboard, status, canManage);
    } catch (error) {
      return persistenceError(error);
    }
  }
  async get(company: CompanyContext, dashboard: string, tab: string, canManage: boolean) {
    try {
      const result = await this.repository.get(company, dashboard, tab, canManage);
      if (!result) throw new AppError('La Tab solicitada no existe o no está disponible.', { statusCode: 404, code: 'DASHBOARD_TAB_NOT_FOUND' });
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }
  async create(company: CompanyContext, dashboard: string, input: CreateDashboardTabDto, actor: number) {
    try {
      const result = await this.repository.create(company, dashboard, input, actor);
      if (!result) throw new AppError('No fue posible crear la Tab.', { code: 'DASHBOARD_TAB_CREATE_FAILED' });
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }
  async update(company: CompanyContext, dashboard: string, tab: string, input: UpdateDashboardTabDto, actor: number) {
    try {
      const result = await this.repository.update(company, dashboard, tab, input, actor);
      if (!result) throw new AppError('La Tab solicitada no existe.', { statusCode: 404, code: 'DASHBOARD_TAB_NOT_FOUND' });
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }
  async duplicate(company: CompanyContext, dashboard: string, tab: string, input: DuplicateDashboardTabDto, actor: number) {
    try {
      const result = await this.repository.duplicate(company, dashboard, tab, input, actor);
      if (!result) throw new AppError('La Tab solicitada no existe.', { statusCode: 404, code: 'DASHBOARD_TAB_NOT_FOUND' });
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }
  async reorder(company: CompanyContext, dashboard: string, input: ReorderDashboardTabsDto, actor: number) {
    try {
      return await this.repository.reorder(company, dashboard, input, actor);
    } catch (error) {
      return persistenceError(error);
    }
  }
  async setDefault(company: CompanyContext, dashboard: string, tab: string, actor: number) {
    try {
      const result = await this.repository.setDefault(company, dashboard, tab, actor);
      if (!result) throw new AppError('La Tab solicitada no existe.', { statusCode: 404, code: 'DASHBOARD_TAB_NOT_FOUND' });
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }
  async setStatus(company: CompanyContext, dashboard: string, tab: string, input: SetDashboardTabStatusDto, actor: number) {
    try {
      const result = await this.repository.setStatus(company, dashboard, tab, input, actor);
      if (!result) throw new AppError('La Tab solicitada no existe.', { statusCode: 404, code: 'DASHBOARD_TAB_NOT_FOUND' });
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }
  async delete(company: CompanyContext, dashboard: string, tab: string) {
    try {
      if (!(await this.repository.delete(company, dashboard, tab)))
        throw new AppError('La Tab solicitada no existe.', { statusCode: 404, code: 'DASHBOARD_TAB_NOT_FOUND' });
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }
}
