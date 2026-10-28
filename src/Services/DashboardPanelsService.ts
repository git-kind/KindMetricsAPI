import { AppError } from '../Errors/AppError.js';
import type { CompanyContext } from '../Models/Common.js';
import type { CreateDashboardPanelDto, MoveDashboardPanelDto, UpdateDashboardPanelDto } from '../Models/Dashboards/DashboardPanelDto.js';
import { DashboardPanelsRepository } from '../Repositories/Dashboards/DashboardPanelsRepository.js';

function persistenceError(error: unknown): never {
  const message = error && typeof error === 'object' && 'sqlMessage' in error && typeof error.sqlMessage === 'string' ? error.sqlMessage : '';
  if (message.includes('VERSION_CONFLICT'))
    throw new AppError('El Panel fue modificado por otra operación.', { statusCode: 409, code: 'DASHBOARD_VERSION_CONFLICT' });
  if (message.includes('DASHBOARD_PANEL_NOT_FOUND'))
    throw new AppError('El Panel solicitado no existe.', { statusCode: 404, code: 'DASHBOARD_PANEL_NOT_FOUND' });
  if (message.includes('DASHBOARD_TAB_NOT_FOUND')) throw new AppError('La Tab solicitada no existe.', { statusCode: 404, code: 'DASHBOARD_TAB_NOT_FOUND' });
  if (message.includes('DASHBOARD_NOT_FOUND')) throw new AppError('El Dashboard solicitado no existe.', { statusCode: 404, code: 'DASHBOARD_NOT_FOUND' });
  if (message.includes('INVALID_DASHBOARD_'))
    throw new AppError('Los datos del Panel o del layout no son válidos.', { statusCode: 400, code: 'INVALID_DASHBOARD_PANEL' });
  if (message.includes('DASHBOARD_PANEL_'))
    throw new AppError('La operación del Panel entra en conflicto con el layout o sus restricciones.', { statusCode: 409, code: 'DASHBOARD_PANEL_CONFLICT' });
  throw error;
}

export class DashboardPanelsService {
  constructor(private readonly repository = new DashboardPanelsRepository()) {}

  async list(company: CompanyContext, dashboard: string, tab: string, filters: { status?: 'ACTIVE' | 'INACTIVE'; panelType?: string }, canManage: boolean) {
    try {
      return await this.repository.list(company, dashboard, tab, filters, canManage);
    } catch (error) {
      return persistenceError(error);
    }
  }
  async get(company: CompanyContext, dashboard: string, tab: string, panel: string, canManage: boolean) {
    try {
      const result = await this.repository.get(company, dashboard, tab, panel, canManage);
      if (!result) throw new AppError('El Panel solicitado no existe o no está disponible.', { statusCode: 404, code: 'DASHBOARD_PANEL_NOT_FOUND' });
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }
  async create(company: CompanyContext, dashboard: string, tab: string, input: CreateDashboardPanelDto, actor: number) {
    try {
      const result = await this.repository.create(company, dashboard, tab, input, actor);
      if (!result) throw new AppError('No fue posible crear el Panel.', { code: 'DASHBOARD_PANEL_CREATE_FAILED' });
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }
  async update(company: CompanyContext, dashboard: string, tab: string, panel: string, input: UpdateDashboardPanelDto, actor: number) {
    try {
      const result = await this.repository.update(company, dashboard, tab, panel, input, actor);
      if (!result) throw new AppError('El Panel solicitado no existe.', { statusCode: 404, code: 'DASHBOARD_PANEL_NOT_FOUND' });
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }
  async duplicate(company: CompanyContext, dashboard: string, tab: string, panel: string, actor: number) {
    try {
      const result = await this.repository.duplicate(company, dashboard, tab, panel, actor);
      if (!result) throw new AppError('El Panel solicitado no existe.', { statusCode: 404, code: 'DASHBOARD_PANEL_NOT_FOUND' });
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }
  async move(company: CompanyContext, dashboard: string, tab: string, panel: string, input: MoveDashboardPanelDto, actor: number) {
    try {
      const result = await this.repository.move(company, dashboard, tab, panel, input, actor);
      if (!result) throw new AppError('No fue posible mover el Panel.', { statusCode: 409, code: 'DASHBOARD_PANEL_MOVE_INVALID' });
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }
  async setStatus(
    company: CompanyContext,
    dashboard: string,
    tab: string,
    panel: string,
    input: { status: 'ACTIVE' | 'INACTIVE'; expectedVersion: number },
    actor: number,
  ) {
    try {
      const result = await this.repository.setStatus(company, dashboard, tab, panel, input, actor);
      if (!result) throw new AppError('El Panel solicitado no existe.', { statusCode: 404, code: 'DASHBOARD_PANEL_NOT_FOUND' });
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }
  async delete(company: CompanyContext, dashboard: string, tab: string, panel: string) {
    try {
      if (!(await this.repository.delete(company, dashboard, tab, panel)))
        throw new AppError('El Panel solicitado no existe.', { statusCode: 404, code: 'DASHBOARD_PANEL_NOT_FOUND' });
    } catch (error) {
      if (error instanceof AppError) throw error;
      return persistenceError(error);
    }
  }
  async saveLayout(company: CompanyContext, dashboard: string, tab: string, panels: unknown, actor: number) {
    try {
      return await this.repository.saveLayout(company, dashboard, tab, panels, actor);
    } catch (error) {
      return persistenceError(error);
    }
  }
}
