import type { RowDataPacket } from 'mysql2';
import type { CompanyContext } from '../../Models/Common.js';
import { CompanyDatabaseRepository, type ProcedureParameter } from '../CompanyDatabaseRepository.js';
import { companyConnectionService } from '../../Services/CompanyConnectionService.js';

export type DashboardPanelExecutionConfig = {
  panelGuid: string;
  panelType: string;
  status: string;
  isVisible: number | boolean;
  dashboardStatus: string;
  tabStatus: string;
  dashboardProcedureGuid: string | null;
  procedureName: string | null;
  procedureStatus: string | null;
  parametersSchema: unknown;
  resultSchema: unknown;
  procedureParams: unknown;
  panelTimeoutSeconds: number;
  procedureTimeoutSeconds: number | null;
};

type ExecutionConfigRow = RowDataPacket & Record<string, unknown>;

export class DashboardPanelExecutionRepository {
  constructor(private readonly database = new CompanyDatabaseRepository()) {}

  async getConfig(company: CompanyContext, dashboardGuid: string, tabGuid: string, panelGuid: string) {
    const row = (
      await this.database.callRows<ExecutionConfigRow>(company, 'sp_dashboard_panel_execution_get', [dashboardGuid, tabGuid, panelGuid])
    )[0];
    if (!row) return undefined;
    const parse = (value: unknown) => (typeof value === 'string' ? (JSON.parse(value) as unknown) : value);
    return {
      panelGuid: String(row.panel_guid),
      panelType: String(row.panel_type),
      status: String(row.panel_status),
      isVisible: row.is_visible as number | boolean,
      dashboardStatus: String(row.dashboard_status),
      tabStatus: String(row.tab_status),
      dashboardProcedureGuid: row.dashboard_procedure_guid == null ? null : String(row.dashboard_procedure_guid),
      procedureName: row.procedure_name == null ? null : String(row.procedure_name),
      procedureStatus: row.procedure_status == null ? null : String(row.procedure_status),
      parametersSchema: parse(row.parameters_schema),
      resultSchema: parse(row.result_schema),
      procedureParams: parse(row.procedure_params),
      panelTimeoutSeconds: Number(row.panel_timeout_seconds ?? 30),
      procedureTimeoutSeconds: row.procedure_timeout_seconds == null ? null : Number(row.procedure_timeout_seconds),
    } satisfies DashboardPanelExecutionConfig;
  }

  async execute(company: CompanyContext, procedureName: string, parameters: readonly ProcedureParameter[], timeoutSeconds: number) {
    if (!/^sp_dashboard_[a-z0-9_]{1,112}$/.test(procedureName)) throw new Error('Invalid authorized procedure name');
    const pool = await companyConnectionService.getPool(company);
    const connection = await pool.getConnection();
    let reusable = true;
    let transactionStarted = false;
    try {
      await connection.query('SET TRANSACTION READ ONLY');
      await connection.beginTransaction();
      transactionStarted = true;
      const placeholders = parameters.map(() => '?').join(',');
      const [result] = await connection.query<RowDataPacket[][]>(
        { sql: `CALL ${procedureName}(${placeholders})`, timeout: timeoutSeconds * 1000 },
        [...parameters],
      );
      return result.filter(Array.isArray) as RowDataPacket[][];
    } catch (error) {
      reusable = false;
      connection.destroy();
      throw error;
    } finally {
      if (reusable) {
        if (transactionStarted) {
          try {
            await connection.rollback();
          } catch {
            reusable = false;
            connection.destroy();
          }
        }
        if (reusable) connection.release();
      }
    }
  }
}