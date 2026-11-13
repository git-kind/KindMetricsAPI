import { AppError } from '../Errors/AppError.js';
import {
  inferDashboardProcedureResultColumns,
  normalizeDashboardProcedureValue,
} from '../Helpers/DashboardProcedureResult.js';
import type { CompanyContext } from '../Models/Common.js';
import type { DashboardProcedurePreviewDto, DashboardSchemaQueryDto, ValidateDashboardProcedureDto } from '../Models/DashboardMetadata/DashboardMetadataDto.js';
import { DashboardMetadataRepository } from '../Repositories/DashboardMetadataRepository.js';

const maxPreviewRows = 500;
const maxPreviewBytes = 2_000_000;
type DashboardDataType = 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'DATE' | 'DATETIME';

function invalidPreviewParameter(name: string): never {
  throw new AppError(`El valor de ${name} no coincide con la firma del procedimiento.`, {
    statusCode: 400,
    code: 'DASHBOARD_PROCEDURE_PARAMETER_INVALID',
    field: `parameters.${name}`,
  });
}

function validDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function mysqlDateTime(value: unknown, name: string, type: 'DATE' | 'DATETIME'): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') return invalidPreviewParameter(name);
  if (type === 'DATE') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match || !validDateParts(Number(match[1]), Number(match[2]), Number(match[3]))) {
      return invalidPreviewParameter(name);
    }
    return value;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match) return invalidPreviewParameter(name);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction, timezone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (!validDateParts(year, month, day) || hour > 23 || minute > 59 || second > 59) return invalidPreviewParameter(name);

  if (timezone) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return invalidPreviewParameter(name);
    return date.toISOString().replace('T', ' ').replace('Z', '');
  }
  return `${yearText}-${monthText}-${dayText} ${hourText}:${minuteText}:${secondText}${fraction ? `.${fraction}` : ''}`;
}

function previewArguments(
  procedure: NonNullable<Awaited<ReturnType<DashboardMetadataRepository['inspectProcedure']>>>,
  values: DashboardProcedurePreviewDto['parameters'],
): Array<string | number | null | Buffer> {
  const parameters = procedure.parameters;
  const knownNames = new Set(parameters.map((parameter) => parameter.name));
  for (const name of Object.keys(values)) {
    if (!knownNames.has(name)) {
      throw new AppError(`El parámetro ${name} no existe en la firma del procedimiento.`, {
        statusCode: 400,
        code: 'DASHBOARD_PROCEDURE_PARAMETER_UNKNOWN',
        field: `parameters.${name}`,
      });
    }
  }
  return parameters.map((parameter) => {
    if (!Object.hasOwn(values, parameter.name)) {
      throw new AppError(`Falta el parámetro requerido ${parameter.name}.`, {
        statusCode: 400,
        code: 'DASHBOARD_PROCEDURE_PARAMETER_REQUIRED',
        field: `parameters.${parameter.name}`,
      });
    }
    const value = values[parameter.name];
    if (value === null) return null;
    switch (parameter.type) {
      case 'STRING':
        if (typeof value === 'string') return value;
        return invalidPreviewParameter(parameter.name);
      case 'NUMBER':
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        return invalidPreviewParameter(parameter.name);
      case 'INTEGER':
        if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
        if (typeof value === 'string' && /^-?\d+$/.test(value)) return value;
        return invalidPreviewParameter(parameter.name);
      case 'BOOLEAN':
        if (typeof value === 'boolean') return value ? 1 : 0;
        return invalidPreviewParameter(parameter.name);
      case 'DATE':
      case 'DATETIME':
        return mysqlDateTime(value, parameter.name, parameter.type);
    }
  });
}

function inferResultSchema(rows: Array<Record<string, unknown>>): {
  schemaVersion: 1;
  columns: Array<{ name: string; type: DashboardDataType }>;
} {
  const firstRow = rows[0];
  if (!firstRow || Object.keys(firstRow).length === 0) {
    throw new AppError('No se pudieron detectar las columnas del procedimiento porque no devolvió filas.', {
      statusCode: 422,
      code: 'DASHBOARD_PROCEDURE_RESULT_SCHEMA_UNAVAILABLE',
    });
  }
  return {
    schemaVersion: 1,
    columns: inferDashboardProcedureResultColumns(rows),
  };
}

function storedResultColumns(value: unknown): Array<{
  name: string;
  type: DashboardDataType;
}> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [];
  }
  const schema = value as Record<string, unknown>;
  if (schema.schemaVersion !== 1 || !Array.isArray(schema.columns)) {
    return [];
  }
  const validTypes = new Set<DashboardDataType>([
    'STRING',
    'NUMBER',
    'INTEGER',
    'BOOLEAN',
    'DATE',
    'DATETIME',
  ]);
  return schema.columns.filter(
    (column): column is { name: string; type: DashboardDataType } =>
      typeof column === 'object' &&
      column !== null &&
      !Array.isArray(column) &&
      typeof (column as Record<string, unknown>).name === 'string' &&
      validTypes.has((column as Record<string, unknown>).type as DashboardDataType),
  );
}

export class DashboardMetadataService {
  private readonly activePreviews = new Map<number, number>();

  constructor(private readonly repository = new DashboardMetadataRepository()) {}

  async schema(company: CompanyContext, query: DashboardSchemaQueryDto) {
    return this.repository.schema(company, query);
  }

  async discoverProcedures(company: CompanyContext) {
    return this.repository.discoverProcedures(company);
  }

  async validateProcedure(company: CompanyContext, input: ValidateDashboardProcedureDto) {
    const procedure = await this.repository.inspectProcedure(company, input.procedureName);
    if (!procedure) {
      return {
        valid: false,
        procedureName: input.procedureName,
        securityType: null,
        parameters: [],
        errors: ['El procedimiento no existe o no cumple el prefijo sp_dash_ requerido.'],
      };
    }
    const errors: string[] = [];
    if (!procedure.executable) errors.push('El procedimiento solo puede aceptar parámetros IN.');
    if (input.parametersSchema) {
      const expected = input.parametersSchema.parameters;
      const actual = procedure.parameters;
      if (expected.length !== actual.length) errors.push('La cantidad de parámetros no coincide con la firma del procedimiento.');
      for (let index = 0; index < Math.min(expected.length, actual.length); index += 1) {
        const expectedParameter = expected[index]!;
        const actualParameter = actual[index]!;
        if (expectedParameter.name !== actualParameter.name || expectedParameter.type !== actualParameter.type) {
          errors.push(`El parámetro en la posición ${index + 1} no coincide con la firma del procedimiento.`);
        }
      }
    }
    return {
      valid: errors.length === 0,
      procedureName: procedure.procedureName,
      securityType: procedure.securityType,
      parameters: procedure.parameters,
      errors,
    };
  }

  async previewProcedure(company: CompanyContext, input: DashboardProcedurePreviewDto) {
    const procedure = await this.repository.inspectProcedure(company, input.procedureName);
    if (!procedure) {
      throw new AppError('El procedimiento no existe o no cumple el prefijo sp_dash_ requerido.', {
        statusCode: 404,
        code: 'DASHBOARD_PROCEDURE_NOT_FOUND',
      });
    }
    if (!procedure.executable) {
      throw new AppError('El procedimiento solo puede aceptar parámetros IN.', {
        statusCode: 403,
        code: 'DASHBOARD_PROCEDURE_PARAMETERS_UNSUPPORTED',
      });
    }
    const parameters = previewArguments(procedure, input.parameters);
    const storedResultSchema = await this.repository.getActiveProcedureResultSchema(company, input.procedureName);
    if (storedResultSchema === undefined) {
      throw new AppError('No fue posible preparar el contrato interno del procedimiento.', {
        statusCode: 403,
        code: 'DASHBOARD_PROCEDURE_NOT_ACTIVE',
      });
    }
    const running = this.activePreviews.get(company.id) ?? 0;
    if (running >= 2) {
      throw new AppError('Se alcanzó el límite de previews concurrentes para la Company.', {
        statusCode: 429,
        code: 'DASHBOARD_PROCEDURE_PREVIEW_CONCURRENCY_LIMIT',
      });
    }
    this.activePreviews.set(company.id, running + 1);
    try {
      const startedAt = Date.now();
      const execution = await this.repository.previewProcedure(company, input.procedureName, parameters, 30);
      const resultSets = execution.resultSets;
      if (resultSets.length > 1) {
        throw new AppError('El procedimiento devolvió más de un conjunto de resultados.', {
          statusCode: 502,
          code: 'DASHBOARD_PROCEDURE_RESULT_INVALID',
        });
      }
      const rawRows = (resultSets[0] ?? []) as Array<Record<string, unknown>>;
      if (rawRows.length > maxPreviewRows) {
        throw new AppError('El resultado excede el límite de filas del preview.', {
          statusCode: 413,
          code: 'DASHBOARD_PROCEDURE_RESULT_TOO_LARGE',
        });
      }
      const columns = execution.columns.length
        ? execution.columns
        : rawRows.length
          ? inferResultSchema(rawRows).columns
          : storedResultColumns(storedResultSchema);
      const names = columns.map((column) => column.name);
      if (
        rawRows.some((row) => {
          const rowNames = Object.keys(row);
          return rowNames.length !== names.length || names.some((name) => !Object.hasOwn(row, name));
        })
      ) {
        throw new AppError('El procedimiento devolvió filas con columnas inconsistentes.', {
          statusCode: 502,
          code: 'DASHBOARD_PROCEDURE_RESULT_SCHEMA_MISMATCH',
        });
      }
      const rows = rawRows.map((row) =>
        Object.fromEntries(
          columns.map((column) => [
            column.name,
            normalizeDashboardProcedureValue(
              row[column.name],
              column.type,
              'DASHBOARD_PROCEDURE_RESULT_SCHEMA_MISMATCH',
            ),
          ]),
        ),
      );
      if (Buffer.byteLength(JSON.stringify(rows), 'utf8') > maxPreviewBytes) {
        throw new AppError('El resultado excede el límite de tamaño del preview.', {
          statusCode: 413,
          code: 'DASHBOARD_PROCEDURE_RESULT_TOO_LARGE',
        });
      }
      return {
        kind: 'KindMetricsDataFrame' as const,
        version: 1 as const,
        columns,
        rows,
        rowCount: rows.length,
        executionTimeMs: Date.now() - startedAt,
        executedAt: new Date().toISOString(),
      };
    } finally {
      const remaining = (this.activePreviews.get(company.id) ?? 1) - 1;
      if (remaining === 0) this.activePreviews.delete(company.id);
      else this.activePreviews.set(company.id, remaining);
    }
  }
}
