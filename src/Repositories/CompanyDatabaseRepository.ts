import type { RowDataPacket } from 'mysql2';
import type { CompanyContext } from '../Models/Common.js';
import { companyConnectionService } from '../Services/CompanyConnectionService.js';

export type ProcedureParameter = string | number | null;

export class CompanyDatabaseRepository {
  async callRows<T extends RowDataPacket>(
    company: CompanyContext,
    procedure: string,
    params: readonly ProcedureParameter[] = [],
  ): Promise<T[]> {
    const resultSets = await this.callResultSets<T>(company, procedure, params);
    return resultSets[0] ?? [];
  }

  async callResultSets<T extends RowDataPacket>(
    company: CompanyContext,
    procedure: string,
    params: readonly ProcedureParameter[] = [],
  ): Promise<T[][]> {
    if (!/^sp_[a-z0-9_]+$/.test(procedure)) {
      throw new Error('Invalid stored procedure name');
    }
    const companyPool = await companyConnectionService.getPool(company);
    const placeholders = params.map(() => '?').join(',');
    const [result] = await companyPool.query<RowDataPacket[][]>(
      `CALL ${procedure}(${placeholders})`,
      [...params],
    );
    return result.filter(Array.isArray) as T[][];
  }
}

export const companyDatabaseRepository = new CompanyDatabaseRepository();
