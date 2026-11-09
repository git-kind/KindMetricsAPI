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

  async syncDiscoveredProcedure(
    company: CompanyContext,
    procedureName: string,
    parametersSchema: { schemaVersion: 1; parameters: Array<{ name: string; type: string; required: boolean }> },
    actor: number,
  ) {
    const serializedParameters = JSON.stringify(parametersSchema);
    await this.database.queryRows<ProcedureRow>(
      company,
      `INSERT INTO dashboard_procedures(
         guid, procedure_name, description, parameters_schema, result_schema, status,
         execution_timeout_seconds, version, created_by
       )
       SELECT UUID(), ?, NULL, ?,
         JSON_OBJECT('schemaVersion', 1, 'columns', JSON_ARRAY()),
         'ACTIVE', 30, 1, ?
       WHERE EXISTS (
         SELECT 1 FROM information_schema.ROUTINES
         WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_NAME = ?
           AND ROUTINE_TYPE = 'PROCEDURE'
       )
       AND (
         SELECT COUNT(*) FROM information_schema.PARAMETERS
         WHERE SPECIFIC_SCHEMA = DATABASE() AND SPECIFIC_NAME = ?
       ) = JSON_LENGTH(JSON_EXTRACT(?, '$.parameters'))
       AND (
         SELECT COUNT(*) FROM information_schema.PARAMETERS
         WHERE SPECIFIC_SCHEMA = DATABASE() AND SPECIFIC_NAME = ? AND PARAMETER_MODE = 'IN'
       ) = JSON_LENGTH(JSON_EXTRACT(?, '$.parameters'))
       AND NOT EXISTS (
         SELECT 1
         FROM JSON_TABLE(?, '$.parameters[*]' COLUMNS(
           ordinal FOR ORDINALITY,
           parameter_name VARCHAR(64) PATH '$.name',
           parameter_type VARCHAR(20) PATH '$.type'
         )) expected
         LEFT JOIN information_schema.PARAMETERS actual
           ON actual.SPECIFIC_SCHEMA = DATABASE()
           AND actual.SPECIFIC_NAME = ?
           AND actual.ORDINAL_POSITION = expected.ordinal
         WHERE actual.PARAMETER_NAME IS NULL OR expected.parameter_name <> actual.PARAMETER_NAME
           OR (expected.parameter_type = 'STRING' AND actual.DATA_TYPE NOT IN ('char','varchar','tinytext','text','mediumtext','longtext'))
           OR (expected.parameter_type = 'NUMBER' AND actual.DATA_TYPE NOT IN ('decimal','float','double'))
           OR (expected.parameter_type = 'INTEGER' AND actual.DATA_TYPE NOT IN ('tinyint','smallint','mediumint','int','bigint'))
           OR (expected.parameter_type = 'BOOLEAN' AND actual.DATA_TYPE NOT IN ('tinyint','bit','boolean'))
           OR (expected.parameter_type = 'DATE' AND actual.DATA_TYPE <> 'date')
           OR (expected.parameter_type = 'DATETIME' AND actual.DATA_TYPE NOT IN ('datetime','timestamp'))
       )
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.PARAMETERS
         WHERE SPECIFIC_SCHEMA = DATABASE() AND SPECIFIC_NAME = ? AND PARAMETER_MODE <> 'IN'
       )
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id),
         version = version + IF(status <> 'ACTIVE' OR parameters_schema <> VALUES(parameters_schema), 1, 0),
         updated_by = IF(status <> 'ACTIVE' OR parameters_schema <> VALUES(parameters_schema), ?, updated_by),
         updated_at = IF(status <> 'ACTIVE' OR parameters_schema <> VALUES(parameters_schema), CURRENT_TIMESTAMP(3), updated_at),
         parameters_schema = VALUES(parameters_schema),
         status = 'ACTIVE',
         reviewed_by = NULL,
         approval_reference = NULL`,
      [
        procedureName,
        serializedParameters,
        actor,
        procedureName,
        procedureName,
        serializedParameters,
        procedureName,
        serializedParameters,
        serializedParameters,
        procedureName,
        procedureName,
        actor,
      ],
    );
    const rows = await this.database.queryRows<ProcedureRow>(
      company,
      `SELECT id, guid, procedure_name, description, parameters_schema, result_schema, status,
         execution_timeout_seconds, version, created_at, created_by, updated_at, updated_by,
         reviewed_by, approval_reference
       FROM dashboard_procedures
       WHERE procedure_name = ? AND status = 'ACTIVE'
         AND JSON_EXTRACT(parameters_schema, '$') = JSON_EXTRACT(?, '$')
         AND EXISTS (
           SELECT 1 FROM information_schema.ROUTINES
           WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_NAME = dashboard_procedures.procedure_name
             AND ROUTINE_TYPE = 'PROCEDURE'
         )
       LIMIT 1`,
      [procedureName, serializedParameters],
    );
    return rows[0] ? toProcedure(rows[0]) : undefined;
  }

  async list(company: CompanyContext, includeInactive: boolean) {
    const rows = await this.database.queryRows<ProcedureRow>(
      company,
      `SELECT id, guid, procedure_name, description, parameters_schema, result_schema, status,
         execution_timeout_seconds, version, created_at, created_by, updated_at, updated_by,
         reviewed_by, approval_reference
       FROM dashboard_procedures
       WHERE ? = 1 OR status = 'ACTIVE'
       ORDER BY procedure_name, id`,
      [includeInactive ? 1 : 0],
    );
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
