import type { RowDataPacket } from 'mysql2';
import { AppError } from '../../Errors/AppError.js';
import type { CompanyContext } from '../../Models/Common.js';
import type { CreateDashboardDto, DashboardFiltersDto, DashboardResponseDto, UpdateDashboardDto } from '../../Models/Dashboards/DashboardDto.js';
import { CompanyDatabaseRepository } from '../CompanyDatabaseRepository.js';
import type { DashboardRepository } from './DashboardRepository.js';

type DashboardRow = RowDataPacket & {
  id: number | string;
  guid: string;
  name: string;
  description: string | null;
  folder_id: number | string | null;
  tags: string | string[];
  status: 'ACTIVE' | 'INACTIVE';
  version: number | string;
  created_at: Date | string;
  created_by: number | string;
  updated_at: Date | string | null;
  updated_by: number | string | null;
};

function parseTags(value: string | string[]): string[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new AppError('El Dashboard almacenado tiene etiquetas con formato inválido.', {
        code: 'DASHBOARD_DATA_INVALID',
      });
    }
  }
  if (!Array.isArray(parsed) || !parsed.every((tag) => typeof tag === 'string')) {
    throw new AppError('El Dashboard almacenado tiene etiquetas con formato inválido.', {
      code: 'DASHBOARD_DATA_INVALID',
    });
  }
  return parsed;
}

function positiveSafeInteger(value: number | string, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new AppError(`El campo ${field} del Dashboard almacenado es inválido.`, {
      code: 'DASHBOARD_DATA_INVALID',
    });
  }
  return parsed;
}

function formatDate(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('El Dashboard almacenado tiene una fecha inválida.', {
      code: 'DASHBOARD_DATA_INVALID',
    });
  }
  return date.toISOString();
}

function toDashboard(row: DashboardRow): DashboardResponseDto {
  return {
    id: positiveSafeInteger(row.id, 'id'),
    guid: row.guid,
    name: row.name,
    description: row.description,
    folderId: row.folder_id === null ? null : positiveSafeInteger(row.folder_id, 'folder_id'),
    tags: parseTags(row.tags),
    status: row.status,
    version: positiveSafeInteger(row.version, 'version'),
    createdAt: formatDate(row.created_at)!,
    createdBy: positiveSafeInteger(row.created_by, 'created_by'),
    updatedAt: formatDate(row.updated_at),
    updatedBy: row.updated_by === null ? null : positiveSafeInteger(row.updated_by, 'updated_by'),
  };
}

function translatePersistenceError(error: unknown): never {
  const message = error && typeof error === 'object' && 'sqlMessage' in error && typeof error.sqlMessage === 'string' ? error.sqlMessage : '';
  if (message.includes('DASHBOARD_VERSION_CONFLICT')) {
    throw new AppError('El Dashboard fue modificado por otra operación. Recarga el recurso e inténtalo de nuevo.', {
      statusCode: 409,
      code: 'DASHBOARD_VERSION_CONFLICT',
    });
  }
  if (message.includes('DASHBOARD_DELETE_BLOCKED')) {
    throw new AppError('No se puede eliminar el Dashboard porque tiene dependencias.', {
      statusCode: 409,
      code: 'DASHBOARD_DELETE_BLOCKED',
    });
  }
  if (message.includes('DASHBOARD_NOT_FOUND')) {
    throw new AppError('El Dashboard solicitado no existe o no está disponible.', {
      statusCode: 404,
      code: 'DASHBOARD_NOT_FOUND',
    });
  }
  if (message.includes('INVALID_DASHBOARD_')) {
    throw new AppError('Los datos del Dashboard no cumplen las reglas de validación.', {
      statusCode: 400,
      code: 'INVALID_DASHBOARD_DATA',
    });
  }
  throw error;
}

export class MySqlDashboardRepository implements DashboardRepository {
  constructor(private readonly database = new CompanyDatabaseRepository()) {}

  async list(company: CompanyContext, filters: DashboardFiltersDto, includeInactive: boolean) {
    try {
      const sets = await this.database.callResultSets<DashboardRow>(company, 'sp_dashboard_list', [
        filters.search ?? null,
        filters.folderId ?? null,
        filters.status ?? null,
        filters.tags ? JSON.stringify(filters.tags) : null,
        filters.page,
        filters.pageSize,
        filters.sortBy,
        filters.sortDirection,
        includeInactive ? 1 : 0,
      ]);
      const dashboards = (sets[0] ?? []).map(toDashboard);
      const total = Number(sets[1]?.[0]?.total_count ?? 0);
      return { dashboards, total };
    } catch (error) {
      return translatePersistenceError(error);
    }
  }

  async get(company: CompanyContext, guid: string, includeInactive: boolean) {
    try {
      const rows = await this.database.callRows<DashboardRow>(company, 'sp_dashboard_get', [guid, includeInactive ? 1 : 0]);
      return rows[0] ? toDashboard(rows[0]) : undefined;
    } catch (error) {
      return translatePersistenceError(error);
    }
  }

  async create(company: CompanyContext, input: CreateDashboardDto, actorId: number) {
    try {
      const rows = await this.database.callRows<DashboardRow>(company, 'sp_dashboard_create', [
        input.name,
        input.description ?? null,
        input.folderId ?? null,
        JSON.stringify(input.tags),
        actorId,
      ]);
      if (!rows[0]) {
        throw new AppError('No se pudo recuperar el Dashboard recién creado.', {
          code: 'DASHBOARD_CREATE_FAILED',
        });
      }
      return toDashboard(rows[0]);
    } catch (error) {
      return translatePersistenceError(error);
    }
  }

  async update(company: CompanyContext, guid: string, input: UpdateDashboardDto, actorId: number) {
    try {
      const { expectedVersion, ...properties } = input;
      const rows = await this.database.callRows<DashboardRow>(company, 'sp_dashboard_update', [guid, JSON.stringify(properties), expectedVersion, actorId]);
      return rows[0] ? toDashboard(rows[0]) : undefined;
    } catch (error) {
      return translatePersistenceError(error);
    }
  }

  async duplicate(company: CompanyContext, guid: string, name: string | undefined, includePanels: boolean, actorId: number) {
    try {
      const rows = await this.database.callRows<DashboardRow>(company, 'sp_dashboard_duplicate', [guid, name ?? null, includePanels ? 1 : 0, actorId]);
      return rows[0] ? toDashboard(rows[0]) : undefined;
    } catch (error) {
      return translatePersistenceError(error);
    }
  }

  async setStatus(company: CompanyContext, guid: string, status: 'ACTIVE' | 'INACTIVE', expectedVersion: number, actorId: number) {
    try {
      const rows = await this.database.callRows<DashboardRow>(company, 'sp_dashboard_set_status', [guid, status, expectedVersion, actorId]);
      return rows[0] ? toDashboard(rows[0]) : undefined;
    } catch (error) {
      return translatePersistenceError(error);
    }
  }

  async delete(company: CompanyContext, guid: string) {
    try {
      const rows = await this.database.callRows<RowDataPacket>(company, 'sp_dashboard_delete', [guid]);
      return rows.length > 0;
    } catch (error) {
      return translatePersistenceError(error);
    }
  }
}
