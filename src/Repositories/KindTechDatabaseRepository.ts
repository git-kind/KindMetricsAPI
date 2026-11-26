import type { RowDataPacket } from 'mysql2';
import type { CompanyContext } from '../Models/Common.js';
import { pool } from '../Config/DatabaseConfig.js';
import {
  callStoredProcedure,
  executeReadOnlyProcedureWithMetadata,
  getExecutorDatabaseName,
  getExecutorUserName,
  logDatabaseConnection,
  type ProcedureResultColumn,
} from '../Database/SqlExecutor.js';

export class KindTechDatabaseRepository {
  getConnectionDetails() {
    return {
      database: getExecutorDatabaseName(pool) ?? process.env.MYSQL_DATABASE ?? 'kindmetrics',
      databaseUser: getExecutorUserName(pool) ?? process.env.MYSQL_USER ?? null,
    };
  }

  async logConnection(_company: CompanyContext, message: string, requestId?: string): Promise<void> {
    logDatabaseConnection(pool, message, requestId ? { requestId } : {});
  }

  async execute(_company: CompanyContext, sql: string, params: readonly (string | number | null | Buffer)[] = []) {
    const [result] = await pool.execute(sql, [...params]);
    return result;
  }

  async queryRows<T extends RowDataPacket>(
    _company: CompanyContext,
    sql: string,
    params: readonly (string | number | null | Buffer)[] = [],
  ): Promise<T[]> {
    const [rows] = await pool.execute<T[]>(sql, [...params]);
    return rows;
  }

  async callRows<T extends RowDataPacket>(
    company: CompanyContext,
    procedure: string,
    params: readonly (string | number | null | Buffer)[] = [],
  ): Promise<T[]> {
    const resultSets = await this.callResultSets<T>(company, procedure, params);
    return resultSets[0] ?? [];
  }

  async callCentralRows<T extends RowDataPacket>(
    procedure: string,
    params: readonly (string | number | null | Buffer)[] = [],
  ): Promise<T[]> {
    const resultSets = await this.callCentralResultSets<T>(procedure, params);
    return resultSets[0] ?? [];
  }

  async callResultSets<T extends RowDataPacket>(
    _company: CompanyContext,
    procedure: string,
    params: readonly (string | number | null | Buffer)[] = [],
  ): Promise<T[][]> {
    return this.callCentralResultSets<T>(procedure, params);
  }

  async callCentralResultSets<T extends RowDataPacket>(
    procedure: string,
    params: readonly (string | number | null | Buffer)[] = [],
  ): Promise<T[][]> {
    return callStoredProcedure<T>(pool, procedure, params);
  }

  async executeReadOnlyProcedure(
    company: CompanyContext,
    procedure: string,
    params: readonly (string | number | null | Buffer)[],
    timeoutSeconds: number,
  ): Promise<RowDataPacket[][]> {
    const result = await this.executeReadOnlyProcedureWithMetadata(
      company,
      procedure,
      params,
      timeoutSeconds,
    );
    return result.resultSets;
  }

  async executeReadOnlyProcedureWithMetadata(
    _company: CompanyContext,
    procedure: string,
    params: readonly (string | number | null | Buffer)[],
    timeoutSeconds: number,
  ): Promise<{ resultSets: RowDataPacket[][]; columns: ProcedureResultColumn[] }> {
    return executeReadOnlyProcedureWithMetadata(pool, procedure, params, timeoutSeconds);
  }
}

export const kindTechDatabaseRepository = new KindTechDatabaseRepository();
