import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { AppError } from '../Errors/AppError.js';
import type { CompanyContext } from '../Models/Common.js';
import { companyConnectionService } from '../Services/CompanyConnectionService.js';
import { callStoredProcedure, executeReadOnlyProcedure, executeReadOnlyProcedureWithMetadata, type ProcedureResultColumn } from '../Database/SqlExecutor.js';

export type ProcedureParameter = string | number | null | Buffer;

function translateCompanyDatabaseError(error: unknown): never {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;

  if (code === 'ER_ACCESS_DENIED_ERROR') {
    throw new AppError('MySQL rechazó las credenciales configuradas para la base de datos de la empresa.', {
      statusCode: 503,
      code: 'COMPANY_DATABASE_CREDENTIALS_INVALID',
    });
  }

  if (code === 'ER_BAD_DB_ERROR') {
    throw new AppError('La base de datos configurada para la empresa no existe o no está disponible.', {
      statusCode: 503,
      code: 'COMPANY_DATABASE_NOT_FOUND',
    });
  }

  if (typeof code === 'string' && ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST'].includes(code)) {
    throw new AppError('No fue posible conectar con la base de datos configurada para la empresa.', {
      statusCode: 503,
      code: 'COMPANY_DATABASE_UNAVAILABLE',
    });
  }

  throw error;
}

export class CompanyDatabaseRepository {
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
    try {
      const companyPool = await companyConnectionService.getPool(company);
      return await executeReadOnlyProcedureWithMetadata(companyPool, procedure, params, timeoutSeconds);
    } catch (error) {
      return translateCompanyDatabaseError(error);
    }
  }
}

export const companyDatabaseRepository = new CompanyDatabaseRepository();
