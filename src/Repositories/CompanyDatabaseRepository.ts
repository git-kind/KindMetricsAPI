import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { AppError } from '../Errors/AppError.js';
import type { CompanyContext } from '../Models/Common.js';
import { companyConnectionService } from '../Services/CompanyConnectionService.js';
import { callStoredProcedure, executeReadOnlyProcedure, executeReadOnlyProcedureWithMetadata, getExecutorDatabaseName, logDatabaseConnection, type ProcedureResultColumn } from '../Database/SqlExecutor.js';

export type ProcedureParameter = string | number | null | Buffer;

function translateCompanyDatabaseError(error: unknown): never {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;

  if (code === 'ER_SP_DOES_NOT_EXIST') {
    throw new AppError('El procedimiento autorizado no existe en la base de datos de la empresa.', {
      statusCode: 404,
      code: 'COMPANY_DASHBOARD_PROCEDURE_NOT_FOUND',
      cause: error,
    });
  }

  if (code === 'ER_PROCACCESS_DENIED_ERROR' || code === 'ER_DBACCESS_DENIED_ERROR') {
    throw new AppError('El usuario de la base de datos de la empresa no tiene permiso para ejecutar el procedimiento.', {
      statusCode: 403,
      code: 'COMPANY_DASHBOARD_PROCEDURE_ACCESS_DENIED',
      cause: error,
    });
  }

  if (code === 'ER_ACCESS_DENIED_ERROR') {
    throw new AppError('MySQL rechazó las credenciales configuradas para la base de datos de la empresa.', {
      statusCode: 503,
      code: 'COMPANY_DATABASE_CREDENTIALS_INVALID',
      cause: error,
    });
  }

  if (code === 'ER_BAD_DB_ERROR') {
    throw new AppError('La base de datos configurada para la empresa no existe o no está disponible.', {
      statusCode: 503,
      code: 'COMPANY_DATABASE_NOT_FOUND',
      cause: error,
    });
  }

  if (typeof code === 'string' && ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST'].includes(code)) {
    throw new AppError('No fue posible conectar con la base de datos configurada para la empresa.', {
      statusCode: 503,
      code: 'COMPANY_DATABASE_UNAVAILABLE',
      cause: error,
    });
  }

  throw error;
}

function addDatabaseNameToError(error: unknown, databaseName: string | undefined): Error {
  const source = error && typeof error === 'object' ? error as {
    code?: unknown;
    errno?: unknown;
    sqlState?: unknown;
    sqlMessage?: unknown;
  } : {};
  return Object.assign(new Error('Company database procedure execution failed', { cause: error }), {
    ...(typeof source.code === 'string' ? { code: source.code } : {}),
    ...(typeof source.errno === 'number' ? { errno: source.errno } : {}),
    ...(typeof source.sqlState === 'string' ? { sqlState: source.sqlState } : {}),
    ...(typeof source.sqlMessage === 'string' ? { sqlMessage: source.sqlMessage } : {}),
    ...(databaseName ? { databaseName } : {}),
  });
}

export class CompanyDatabaseRepository {
  async logConnection(company: CompanyContext, message: string, requestId?: string): Promise<void> {
    const companyPool = await companyConnectionService.getPool(company);
    logDatabaseConnection(companyPool, message, requestId ? { requestId } : {});
  }

  async execute(company: CompanyContext, sql: string, params: readonly ProcedureParameter[] = []): Promise<ResultSetHeader> {
    try {
      const companyPool = await companyConnectionService.getPool(company);
      const [result] = await companyPool.execute<ResultSetHeader>(sql, [...params]);
      return result;
    } catch (error) {
      return translateCompanyDatabaseError(error);
    }
  }

  async queryRows<T extends RowDataPacket>(company: CompanyContext, sql: string, params: readonly ProcedureParameter[] = []): Promise<T[]> {
    try {
      const companyPool = await companyConnectionService.getPool(company);
      const [rows] = await companyPool.execute<T[]>(sql, [...params]);
      return rows;
    } catch (error) {
      return translateCompanyDatabaseError(error);
    }
  }

  async callRows<T extends RowDataPacket>(company: CompanyContext, procedure: string, params: readonly ProcedureParameter[] = []): Promise<T[]> {
    const resultSets = await this.callResultSets<T>(company, procedure, params);
    return resultSets[0] ?? [];
  }

  async callResultSets<T extends RowDataPacket>(company: CompanyContext, procedure: string, params: readonly ProcedureParameter[] = []): Promise<T[][]> {
    try {
      const companyPool = await companyConnectionService.getPool(company);
      return await callStoredProcedure<T>(companyPool, procedure, params);
    } catch (error) {
      return translateCompanyDatabaseError(error);
    }
  }

  async executeReadOnlyProcedure(
    company: CompanyContext,
    procedure: string,
    params: readonly ProcedureParameter[],
    timeoutSeconds: number,
  ): Promise<RowDataPacket[][]> {
    try {
      const companyPool = await companyConnectionService.getPool(company);
      return await executeReadOnlyProcedure(companyPool, procedure, params, timeoutSeconds);
    } catch (error) {
      return translateCompanyDatabaseError(error);
    }
  }

  async executeReadOnlyProcedureWithMetadata(
    company: CompanyContext,
    procedure: string,
    params: readonly ProcedureParameter[],
    timeoutSeconds: number,
  ): Promise<{ resultSets: RowDataPacket[][]; columns: ProcedureResultColumn[] }> {
    let companyPool;
    try {
      companyPool = await companyConnectionService.getPool(company);
      return await executeReadOnlyProcedureWithMetadata(companyPool, procedure, params, timeoutSeconds);
    } catch (error) {
      return translateCompanyDatabaseError(
        companyPool ? addDatabaseNameToError(error, getExecutorDatabaseName(companyPool)) : error,
      );
    }
  }
}

export const companyDatabaseRepository = new CompanyDatabaseRepository();
