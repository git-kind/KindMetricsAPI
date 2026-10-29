import type { RowDataPacket } from 'mysql2';
import type { CompanyContext } from '../../Models/Common.js';
import type {
  CreateDashboardProcedureDto,
  DashboardProcedureResponseDto,
  UpdateDashboardProcedureDto,
} from '../../Models/DashboardProcedures/DashboardProcedureDto.js';
import { CompanyDatabaseRepository } from '../CompanyDatabaseRepository.js';

type ProcedureRow = RowDataPacket & Record<string, unknown>;

function parseJson(value: unknown): unknown {
  return typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
}

function toProcedure(row: ProcedureRow): DashboardProcedureResponseDto {
  const date = (value: unknown) => (value == null ? null : new Date(value as Date | string).toISOString());
  return {
    id: Number(row.id),
    guid: String(row.guid),
    procedureName: String(row.procedure_name),
    description: row.description == null ? null : String(row.description),
    parametersSchema: parseJson(row.parameters_schema) as DashboardProcedureResponseDto['parametersSchema'],
    resultSchema: parseJson(row.result_schema) as DashboardProcedureResponseDto['resultSchema'],
    status: row.status as DashboardProcedureResponseDto['status'],
    executionTimeoutSeconds: Number(row.execution_timeout_seconds),
    version: Number(row.version),
    createdAt: date(row.created_at)!,
    createdBy: Number(row.created_by),
    updatedAt: date(row.updated_at),
    updatedBy: row.updated_by == null ? null : Number(row.updated_by),
    reviewedBy: row.reviewed_by == null ? null : Number(row.reviewed_by),
    approvalReference: row.approval_reference == null ? null : String(row.approval_reference),
  };
}

export class DashboardProcedureRepository {
  constructor(private readonly database = new CompanyDatabaseRepository()) {}

  async list(company: CompanyContext, includeInactive: boolean) {
    const rows = await this.database.callRows<ProcedureRow>(company, 'sp_dashboard_procedure_list', [includeInactive ? 1 : 0]);
    return rows.map(toProcedure);
  }

  async get(company: CompanyContext, guid: string, includeInactive: boolean) {
    const rows = await this.database.callRows<ProcedureRow>(company, 'sp_dashboard_procedure_get', [guid, includeInactive ? 1 : 0]);
    return rows[0] ? toProcedure(rows[0]) : undefined;
  }

  async create(company: CompanyContext, input: CreateDashboardProcedureDto, actor: number) {
    const rows = await this.database.callRows<ProcedureRow>(company, 'sp_dashboard_procedure_create', [JSON.stringify(input), actor]);
    return rows[0] ? toProcedure(rows[0]) : undefined;
  }

  async update(company: CompanyContext, guid: string, input: UpdateDashboardProcedureDto, actor: number) {
    const { expectedVersion, ...properties } = input;
    const rows = await this.database.callRows<ProcedureRow>(company, 'sp_dashboard_procedure_update', [
      guid,
      JSON.stringify(properties),
      expectedVersion,
      actor,
    ]);
    return rows[0] ? toProcedure(rows[0]) : undefined;
  }

  async delete(company: CompanyContext, guid: string) {
    const rows = await this.database.callRows<ProcedureRow>(company, 'sp_dashboard_procedure_delete', [guid]);
    return Number(rows[0]?.deleted ?? 0) === 1;
  }
}