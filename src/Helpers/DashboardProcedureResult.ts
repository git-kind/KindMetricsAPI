import { AppError } from '../Errors/AppError.js';

export type DashboardProcedureResultType =
  | 'STRING'
  | 'NUMBER'
  | 'INTEGER'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATETIME';

export function inferDashboardProcedureResultColumns(
  rows: Array<Record<string, unknown>>,
): Array<{ name: string; type: DashboardProcedureResultType }> {
  const firstRow = rows[0];
  if (!firstRow) return [];
  return Object.keys(firstRow).map((name) => {
    const values = rows.map((row) => row[name]).filter((value) => value != null);
    const isBoolean = values.length > 0 && values.every((value) => typeof value === 'boolean');
    const isInteger =
      values.length > 0 &&
      values.every(
        (value) =>
          typeof value === 'bigint' ||
          (typeof value === 'number' && Number.isSafeInteger(value)) ||
          (typeof value === 'string' && /^-?\d+$/.test(value)),
      );
    const isNumber =
      values.length > 0 &&
      values.every(
        (value) =>
          (typeof value === 'number' && Number.isFinite(value)) ||
          typeof value === 'bigint' ||
          (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))),
      );
    const isDate = values.length > 0 && values.every((value) => value instanceof Date);
    const type: DashboardProcedureResultType = isBoolean
      ? 'BOOLEAN'
      : isInteger
        ? 'INTEGER'
        : isNumber
          ? 'NUMBER'
          : isDate
            ? 'DATETIME'
            : 'STRING';
    return { name, type };
  });
}

export function normalizeDashboardProcedureValue(
  value: unknown,
  type: DashboardProcedureResultType,
  errorCode: string,
): unknown {
  if (value === null || value === undefined) return null;
  if (type === 'STRING') {
    if (typeof value !== 'string' && !Buffer.isBuffer(value)) {
      return incompatibleResult(errorCode);
    }
    return Buffer.isBuffer(value) ? value.toString('utf8') : value;
  }
  if (type === 'NUMBER') {
    const number =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(number)) return incompatibleResult(errorCode);
    return typeof value === 'string' ? value : number;
  }
  if (type === 'INTEGER') {
    if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) {
      return value;
    }
    const integer =
      typeof value === 'bigint'
        ? value
        : typeof value === 'number' && Number.isSafeInteger(value)
          ? BigInt(value)
          : typeof value === 'string' && /^-?\d+$/.test(value)
            ? BigInt(value)
            : null;
    if (integer === null) return incompatibleResult(errorCode);
    return integer <= BigInt(Number.MAX_SAFE_INTEGER) &&
      integer >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(integer)
      : integer.toString();
  }
  if (type === 'BOOLEAN') {
    if (value !== true && value !== false && value !== 0 && value !== 1) {
      return incompatibleResult(errorCode);
    }
    return value === true || value === 1;
  }
  const date =
    value instanceof Date
      ? value
      : typeof value === 'string'
        ? new Date(value)
        : null;
  if (!date || Number.isNaN(date.getTime())) return incompatibleResult(errorCode);
  return type === 'DATE' ? date.toISOString().slice(0, 10) : date.toISOString();
}

function incompatibleResult(code: string): never {
  throw new AppError(
    'El procedimiento devolvió un valor incompatible con el tipo detectado en sus resultados.',
    { statusCode: 502, code },
  );
}
