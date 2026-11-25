import { z } from 'zod';
import { AppError } from '../Errors/AppError.js';
import {
  inferDashboardProcedureResultColumns,
  normalizeDashboardProcedureValue,
  type DashboardProcedureResultType,
} from '../Helpers/DashboardProcedureResult.js';
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
type FilterValue = string | number | boolean | null;
type ExecutionFilters = Record<string, FilterValue>;
type DiagnosticParameter = { name: string; value: ProcedureParameter };

function databaseNameFromError(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as { databaseName?: unknown; cause?: unknown };
    if (typeof candidate.databaseName === 'string') return candidate.databaseName;
    current = candidate.cause;
  }
  return undefined;
}

function databaseErrorFromError(error: unknown): Record<string, string | number> | undefined {
  let current = error;
  const details: Record<string, string | number> = {};
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as {
      code?: unknown;
      errno?: unknown;
      sqlState?: unknown;
      sqlMessage?: unknown;
      cause?: unknown;
    };
    if (typeof candidate.code === 'string') details.code = candidate.code;
    if (typeof candidate.errno === 'number') details.number = candidate.errno;
    if (typeof candidate.sqlState === 'string') details.sqlState = candidate.sqlState;
    if (candidate.code === 'ER_NO_SUCH_TABLE' && typeof candidate.sqlMessage === 'string') {
      const missingTable = candidate.sqlMessage.match(/Table '([^']+)' doesn't exist/i)?.[1];
      if (missingTable) details.missingTable = missingTable;
    }
    current = candidate.cause;
  }
  return Object.keys(details).length ? details : undefined;
}

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

function normalizeRows(
  rows: Array<Record<string, unknown>>,
  columns: Array<{ name: string; type: DashboardProcedureResultType }>,
) {
  const allowedColumns = new Set(columns.map((column) => column.name));
  for (const row of rows) {
    const keys = Object.keys(row);
    if (
      keys.length !== columns.length ||
      keys.some((key) => !allowedColumns.has(key)) ||
      columns.some((column) => !Object.hasOwn(row, column.name))
    ) {
      throw new AppError('El procedimiento devolvió columnas inconsistentes con su metadata actual.', {
        statusCode: 502,
        code: 'DASHBOARD_PANEL_RESULT_SCHEMA_MISMATCH',
      });
    }
  }
  return rows.map((row) =>
    Object.fromEntries(
      columns.map((column) => [
        column.name,
        normalizeDashboardProcedureValue(
          row[column.name],
          column.type,
          'DASHBOARD_PANEL_RESULT_SCHEMA_MISMATCH',
        ),
      ]),
    ),
  );
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
    panelName = panelGuid,
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
    if (!contract.success || !mapping.success) {
      throw new AppError('La configuración almacenada del Panel o del procedimiento es inválida.', {
        statusCode: 500,
        code: 'DASHBOARD_PANEL_CONFIGURATION_INVALID',
      });
    }
    const mappedByName = new Map(mapping.data.parameters.map((parameter) => [parameter.name, parameter]));
    if (
      mappedByName.size !== contract.data.parameters.length ||
      contract.data.parameters.some((parameter) => mappedByName.get(parameter.name)?.type !== parameter.type)
    ) {
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
    const diagnosticParameters: DiagnosticParameter[] = [];
    for (const parameter of contract.data.parameters) {
      const mappingEntry = mappedByName.get(parameter.name)!;
      let value: unknown;
      if (mappingEntry.source === 'DASHBOARD_FILTER') value = filters[mappingEntry.filter!];
      if (mappingEntry.source === 'STATIC') value = mappingEntry.value;
      if (mappingEntry.source === 'SYSTEM') {
        value = mappingEntry.systemKey === 'companyGuid' ? company.guid : mappingEntry.systemKey === 'companyId' ? company.id : userGuid;
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
      const parameterValue = (value ?? null) as ProcedureParameter;
      parameters.push(parameterValue);
      diagnosticParameters.push({ name: parameter.name, value: parameterValue });
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
      let execution;
      try {
        execution = await this.repository.execute(company, config.procedureName, parameters, timeoutSeconds);
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        const timedOut = code.includes('TIMEOUT') || code.includes('ETIMEDOUT');
        const databaseError = databaseErrorFromError(error);
        throw new AppError(
          timedOut
            ? 'La ejecución del Panel excedió el tiempo permitido.'
            : 'No fue posible ejecutar el procedimiento autorizado del Panel.',
          {
            statusCode: timedOut ? 504 : 502,
            code: timedOut ? 'DASHBOARD_PANEL_TIMEOUT' : 'DASHBOARD_PANEL_EXECUTION_FAILED',
            cause: error,
            context: {
              panelName,
              panelGuid,
              procedureName: config.procedureName,
              database: databaseNameFromError(error) ?? null,
              parameters: diagnosticParameters,
              ...(databaseError ? { databaseError } : {}),
            },
          },
        );
      }
      const sets = execution.resultSets ?? [];
      if (sets.length > 1) {
        throw new AppError('El procedimiento devolvió más de un conjunto de resultados.', {
          statusCode: 502,
          code: 'DASHBOARD_PANEL_RESULT_INVALID',
        });
      }
      const rawRows = (sets[0] ?? []) as Array<Record<string, unknown>>;
      const columns = execution.columns.length
        ? execution.columns
        : rawRows.length
          ? inferDashboardProcedureResultColumns(rawRows)
          : [];
      const rows = normalizeRows(rawRows, columns);
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
        columns,
        rows,
        rowCount: rows.length,
        executionTimeMs: Date.now() - startedAt,
        executedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw error;
    } finally {
      const remaining = (this.activeExecutions.get(company.id) ?? 1) - 1;
      if (remaining === 0) this.activeExecutions.delete(company.id);
      else this.activeExecutions.set(company.id, remaining);
    }
  }
}
