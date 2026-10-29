import { z } from 'zod';
import { AppError } from '../Errors/AppError.js';
import type { CompanyContext } from '../Models/Common.js';
import { DashboardPanelExecutionRepository } from '../Repositories/Dashboards/DashboardPanelExecutionRepository.js';
import type { ProcedureParameter } from '../Repositories/CompanyDatabaseRepository.js';

const parameterTypes = ['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATE', 'DATETIME'] as const;
const catalogParametersSchema = z.object({
  schemaVersion: z.literal(1),
  parameters: z.array(z.object({ name: z.string(), type: z.enum(parameterTypes), required: z.boolean() })),
});
const panelMappingsSchema = z.object({
  schemaVersion: z.literal(1),
  parameters: z.array(
    z.object({
      name: z.string(),
      type: z.enum(parameterTypes),
      source: z.enum(['DASHBOARD_FILTER', 'STATIC', 'SYSTEM']),
      filter: z.string().optional(),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
      systemKey: z.enum(['companyGuid', 'companyId', 'userGuid']).optional(),
      required: z.boolean(),
    }),
  ),
});
const resultSchema = z.object({
  schemaVersion: z.literal(1),
  columns: z.array(z.object({ name: z.string(), type: z.enum(parameterTypes) })),
});

type FilterValue = string | number | boolean | null;
type ExecutionFilters = Record<string, FilterValue>;

function valueMatchesType(value: unknown, type: (typeof parameterTypes)[number]): value is ProcedureParameter {
  if (value === null) return true;
  switch (type) {
    case 'STRING':
      return typeof value === 'string';
    case 'NUMBER':
      return typeof value === 'number' && Number.isFinite(value);
    case 'INTEGER':
      return typeof value === 'number' && Number.isSafeInteger(value);
    case 'BOOLEAN':
      return typeof value === 'boolean';
    case 'DATE':
    case 'DATETIME':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  }
}

function normalizeRows(rows: Array<Record<string, unknown>>, columns: Array<{ name: string; type: (typeof parameterTypes)[number] }>) {
  const allowedColumns = new Set(columns.map((column) => column.name));
  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.some((key) => !allowedColumns.has(key)) || columns.some((column) => !Object.hasOwn(row, column.name))) {
      throw new AppError('El procedimiento devolvió columnas fuera del contrato registrado.', {
        statusCode: 502,
        code: 'DASHBOARD_PANEL_RESULT_SCHEMA_MISMATCH',
      });
    }
  }
  return rows.map((row) => {
    const normalized: Record<string, unknown> = {};
    for (const column of columns) {
      const value = row[column.name];
      if (value == null) {
        normalized[column.name] = null;
        continue;
      }
      if (column.type === 'STRING') {
        if (typeof value !== 'string' && !Buffer.isBuffer(value)) throw new AppError('Tipo de columna inválido.', { statusCode: 502, code: 'DASHBOARD_PANEL_RESULT_SCHEMA_MISMATCH' });
        normalized[column.name] = Buffer.isBuffer(value) ? value.toString('utf8') : value;
      } else if (column.type === 'NUMBER') {
        const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
        if (!Number.isFinite(numeric)) throw new AppError('Tipo de columna inválido.', { statusCode: 502, code: 'DASHBOARD_PANEL_RESULT_SCHEMA_MISMATCH' });
        normalized[column.name] = Number.isSafeInteger(numeric) ? numeric : String(value);
      } else if (column.type === 'INTEGER') {
        const integer = typeof value === 'bigint' ? value : typeof value === 'number' && Number.isSafeInteger(value) ? BigInt(value) : typeof value === 'string' && /^-?\d+$/.test(value) ? BigInt(value) : null;
        if (integer === null) throw new AppError('Tipo de columna inválido.', { statusCode: 502, code: 'DASHBOARD_PANEL_RESULT_SCHEMA_MISMATCH' });
        normalized[column.name] = integer <= BigInt(Number.MAX_SAFE_INTEGER) && integer >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(integer) : integer.toString();
      } else if (column.type === 'BOOLEAN') {
        if (value !== true && value !== false && value !== 0 && value !== 1) throw new AppError('Tipo de columna inválido.', { statusCode: 502, code: 'DASHBOARD_PANEL_RESULT_SCHEMA_MISMATCH' });
        normalized[column.name] = value === true || value === 1;
      } else {
        const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
        if (!date || Number.isNaN(date.getTime())) throw new AppError('Tipo de columna inválido.', { statusCode: 502, code: 'DASHBOARD_PANEL_RESULT_SCHEMA_MISMATCH' });
        normalized[column.name] = column.type === 'DATE' ? date.toISOString().slice(0, 10) : date.toISOString();
      }
    }
    return normalized;
  });
}

export class DashboardPanelExecutionService {
  private readonly activeExecutions = new Map<number, number>();

  constructor(private readonly repository = new DashboardPanelExecutionRepository()) {}

  async execute(
    company: CompanyContext,
    dashboardGuid: string,
    tabGuid: string,
    panelGuid: string,
    filters: ExecutionFilters,
    userGuid: string,
  ) {
    const config = await this.repository.getConfig(company, dashboardGuid, tabGuid, panelGuid);
    if (!config || config.status !== 'ACTIVE' || !config.isVisible || config.dashboardStatus !== 'ACTIVE' || config.tabStatus !== 'ACTIVE') {
      throw new AppError('El Panel no existe o no está disponible.', { statusCode: 404, code: 'DASHBOARD_PANEL_NOT_FOUND' });
    }
    if (config.panelType === 'TEXT' && !config.dashboardProcedureGuid) {
      return {
        panelGuid,
        panelType: config.panelType,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        executedAt: new Date().toISOString(),
      };
    }
    if (!config.dashboardProcedureGuid || !config.procedureName || config.procedureStatus !== 'ACTIVE') {
      throw new AppError('El Panel no tiene un procedimiento autorizado activo.', {
        statusCode: 409,
        code: 'DASHBOARD_PROCEDURE_NOT_ACTIVE',
      });
    }

    const contract = catalogParametersSchema.safeParse(config.parametersSchema);
    const mapping = panelMappingsSchema.safeParse(config.procedureParams);
    const results = resultSchema.safeParse(config.resultSchema);
    if (!contract.success || !mapping.success || !results.success) {
      throw new AppError('La configuración almacenada del Panel o del procedimiento es inválida.', {
        statusCode: 500,
        code: 'DASHBOARD_PANEL_CONFIGURATION_INVALID',
      });
    }

    const mappedByName = new Map(mapping.data.parameters.map((parameter) => [parameter.name, parameter]));
    if (mappedByName.size !== contract.data.parameters.length || contract.data.parameters.some((parameter) => mappedByName.get(parameter.name)?.type !== parameter.type)) {
      throw new AppError('El mapeo de parámetros del Panel no coincide con el contrato autorizado.', {
        statusCode: 409,
        code: 'DASHBOARD_PANEL_PARAMETER_CONTRACT_MISMATCH',
      });
    }
    const allowedFilters = new Set(
      mapping.data.parameters.filter((parameter) => parameter.source === 'DASHBOARD_FILTER').map((parameter) => parameter.filter!),
    );
    if (Object.keys(filters).some((filter) => !allowedFilters.has(filter))) {
      throw new AppError('La solicitud contiene filtros no definidos por el Panel.', {
        statusCode: 400,
        code: 'DASHBOARD_PANEL_FILTER_UNKNOWN',
      });
    }

    const parameters: ProcedureParameter[] = [];
    for (const parameter of contract.data.parameters) {
      const mappingEntry = mappedByName.get(parameter.name)!;
      let value: unknown;
      if (mappingEntry.source === 'DASHBOARD_FILTER') value = filters[mappingEntry.filter!];
      if (mappingEntry.source === 'STATIC') value = mappingEntry.value;
      if (mappingEntry.source === 'SYSTEM') {
        value =
          mappingEntry.systemKey === 'companyGuid'
            ? company.guid
            : mappingEntry.systemKey === 'companyId'
              ? company.id
              : userGuid;
      }
      if ((value === undefined || value === null) && (parameter.required || mappingEntry.required)) {
        throw new AppError(`Falta un valor requerido para ${parameter.name}.`, {
          statusCode: 400,
          code: 'DASHBOARD_PANEL_PARAMETER_REQUIRED',
          field: parameter.name,
        });
      }
      if (value !== undefined && !valueMatchesType(value, parameter.type)) {
        throw new AppError(`El valor de ${parameter.name} no coincide con su tipo.`, {
          statusCode: 400,
          code: 'DASHBOARD_PANEL_PARAMETER_INVALID',
          field: parameter.name,
        });
      }
      parameters.push((value ?? null) as ProcedureParameter);
    }

    const running = this.activeExecutions.get(company.id) ?? 0;
    if (running >= 8) {
      throw new AppError('Se alcanzó el límite de ejecuciones concurrentes para la Company.', {
        statusCode: 429,
        code: 'DASHBOARD_PANEL_CONCURRENCY_LIMIT',
      });
    }
    this.activeExecutions.set(company.id, running + 1);
    const startedAt = Date.now();
    try {
      const timeoutSeconds = Math.min(config.panelTimeoutSeconds, config.procedureTimeoutSeconds ?? config.panelTimeoutSeconds);
      const sets = (await this.repository.execute(company, config.procedureName, parameters, timeoutSeconds)) ?? [];
      if (sets.length > 1) {
        throw new AppError('El procedimiento devolvió más de un conjunto de resultados.', {
          statusCode: 502,
          code: 'DASHBOARD_PANEL_RESULT_INVALID',
        });
      }
      const rows = normalizeRows((sets[0] ?? []) as Array<Record<string, unknown>>, results.data.columns);
      const serialized = JSON.stringify(rows);
      if (rows.length > 5_000 || Buffer.byteLength(serialized, 'utf8') > 2_000_000) {
        throw new AppError('El resultado excede los límites permitidos para un Panel.', {
          statusCode: 413,
          code: 'DASHBOARD_PANEL_RESULT_TOO_LARGE',
        });
      }
      return {
        panelGuid,
        panelType: config.panelType,
        columns: results.data.columns,
        rows,
        rowCount: rows.length,
        executionTimeMs: Date.now() - startedAt,
        executedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code.includes('TIMEOUT') || code.includes('ETIMEDOUT')) {
        throw new AppError('La ejecución del Panel excedió el tiempo permitido.', { statusCode: 504, code: 'DASHBOARD_PANEL_TIMEOUT' });
      }
      throw new AppError('No fue posible ejecutar el procedimiento autorizado del Panel.', {
        statusCode: 502,
        code: 'DASHBOARD_PANEL_EXECUTION_FAILED',
      });
    } finally {
      const remaining = (this.activeExecutions.get(company.id) ?? 1) - 1;
      if (remaining === 0) this.activeExecutions.delete(company.id);
      else this.activeExecutions.set(company.id, remaining);
    }
  }
}