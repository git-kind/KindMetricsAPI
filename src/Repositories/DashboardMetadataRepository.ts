import type { RowDataPacket } from 'mysql2';
import type { CompanyContext } from '../Models/Common.js';
import { AppError } from '../Errors/AppError.js';
import type { DashboardSchemaQueryDto } from '../Models/DashboardMetadata/DashboardMetadataDto.js';
import { CompanyDatabaseRepository } from './CompanyDatabaseRepository.js';

type MetadataRow = RowDataPacket & Record<string, unknown>;

const mysqlTypeMap: Record<string, 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'DATE' | 'DATETIME'> = {
  char: 'STRING',
  varchar: 'STRING',
  tinytext: 'STRING',
  text: 'STRING',
  mediumtext: 'STRING',
  longtext: 'STRING',
  binary: 'STRING',
  varbinary: 'STRING',
  tinyblob: 'STRING',
  blob: 'STRING',
  mediumblob: 'STRING',
  longblob: 'STRING',
  enum: 'STRING',
  set: 'STRING',
  decimal: 'NUMBER',
  numeric: 'NUMBER',
  float: 'NUMBER',
  double: 'NUMBER',
  tinyint: 'INTEGER',
  smallint: 'INTEGER',
  mediumint: 'INTEGER',
  int: 'INTEGER',
  integer: 'INTEGER',
  bigint: 'INTEGER',
  bit: 'BOOLEAN',
  bool: 'BOOLEAN',
  boolean: 'BOOLEAN',
  date: 'DATE',
  datetime: 'DATETIME',
  timestamp: 'DATETIME',
  time: 'STRING',
  year: 'INTEGER',
  json: 'STRING',
};

function dashboardType(mysqlType: unknown, columnType?: unknown): 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'DATE' | 'DATETIME' {
  const type = String(mysqlType).toLowerCase();
  if (type === 'tinyint' && String(columnType).toLowerCase() === 'tinyint(1)') return 'BOOLEAN';
  return mysqlTypeMap[type] ?? 'STRING';
}

function routineParamMode(value: unknown): 'IN' | 'OUT' | 'INOUT' {
  if (value === 'OUT' || value === 'INOUT') return value;
  return 'IN';
}

export class DashboardMetadataRepository {
  constructor(private readonly database = new CompanyDatabaseRepository()) {}

  async schema(company: CompanyContext, query: DashboardSchemaQueryDto) {
    const tableFilter = query.tableName ?? null;
    const tableRows = await this.database.queryRows<MetadataRow>(
      company,
      `SELECT TABLE_NAME AS table_name, TABLE_TYPE AS table_type, ENGINE AS engine, TABLE_COMMENT AS table_comment
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
         AND (? IS NULL OR TABLE_NAME = ?)
       ORDER BY TABLE_NAME`,
      [tableFilter, tableFilter],
    );
    if (query.tableName && tableRows.length === 0) {
      throw new AppError('La tabla solicitada no existe en la base de la empresa.', {
        statusCode: 404,
        code: 'DASHBOARD_METADATA_TABLE_NOT_FOUND',
      });
    }

    const tableNames = tableRows.map((row) => String(row.table_name));
    if (tableNames.length === 0) return { tables: [], columns: [], indexes: [], relationships: [] };
    const columnRows = await this.database.queryRows<MetadataRow>(
      company,
      `SELECT c.TABLE_NAME AS table_name, c.COLUMN_NAME AS column_name, c.ORDINAL_POSITION AS ordinal_position,
              c.DATA_TYPE AS data_type, c.COLUMN_TYPE AS column_type, c.IS_NULLABLE AS is_nullable,
              c.COLUMN_DEFAULT AS column_default, c.COLUMN_KEY AS column_key
       FROM information_schema.COLUMNS c
       WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME IN (${tableNames.map(() => '?').join(',')})
       ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`,
      tableNames,
    );
    const indexRows = await this.database.queryRows<MetadataRow>(
      company,
      `SELECT TABLE_NAME AS table_name, INDEX_NAME AS index_name, COALESCE(COLUMN_NAME, EXPRESSION) AS column_name,
              SEQ_IN_INDEX AS sequence_in_index, NON_UNIQUE AS non_unique
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${tableNames.map(() => '?').join(',')})
       ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
      tableNames,
    );
    const relationshipRows = await this.database.queryRows<MetadataRow>(
      company,
      `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, CONSTRAINT_NAME AS constraint_name,
              REFERENCED_TABLE_NAME AS referenced_table, REFERENCED_COLUMN_NAME AS referenced_column
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${tableNames.map(() => '?').join(',')})
         AND REFERENCED_TABLE_SCHEMA = DATABASE()
       ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`,
      tableNames,
    );

    return {
      tables: tableRows.map((row) => ({
        name: String(row.table_name),
        type: String(row.table_type) as 'BASE TABLE' | 'VIEW',
        engine: row.engine == null ? null : String(row.engine),
        comment: String(row.table_comment ?? ''),
      })),
      columns: columnRows.map((row) => ({
        tableName: String(row.table_name),
        name: String(row.column_name),
        ordinalPosition: Number(row.ordinal_position),
        dataType: String(row.data_type),
        columnType: String(row.column_type),
        nullable: row.is_nullable === 'YES',
        defaultValue: row.column_default ?? null,
        primaryKey: row.column_key === 'PRI',
      })),
      indexes: indexRows.map((row) => ({
        tableName: String(row.table_name),
        name: String(row.index_name),
        columnName: String(row.column_name),
        sequence: Number(row.sequence_in_index),
        unique: Number(row.non_unique) === 0,
      })),
      relationships: relationshipRows.map((row) => ({
        tableName: String(row.table_name),
        columnName: String(row.column_name),
        constraintName: String(row.constraint_name),
        referencedTable: String(row.referenced_table),
        referencedColumn: String(row.referenced_column),
      })),
    };
  }

  async discoverProcedures(company: CompanyContext) {
    const routineRows = await this.database.queryRows<MetadataRow>(
      company,
      `SELECT ROUTINE_NAME AS routine_name, SECURITY_TYPE AS security_type
       FROM information_schema.ROUTINES
       WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_TYPE = 'PROCEDURE'
         AND ROUTINE_NAME REGEXP '^sp_dash_[A-Za-z0-9_]{1,112}$'
       ORDER BY ROUTINE_NAME`,
    );
    const parameterRows = await this.database.queryRows<MetadataRow>(
      company,
      `SELECT p.SPECIFIC_NAME AS routine_name, p.PARAMETER_NAME AS parameter_name,
              p.DATA_TYPE AS data_type, p.DTD_IDENTIFIER AS column_type,
              p.PARAMETER_MODE AS parameter_mode, p.ORDINAL_POSITION AS ordinal_position
       FROM information_schema.PARAMETERS p
       INNER JOIN information_schema.ROUTINES r
         ON r.ROUTINE_SCHEMA = p.SPECIFIC_SCHEMA AND r.ROUTINE_NAME = p.SPECIFIC_NAME
       WHERE p.SPECIFIC_SCHEMA = DATABASE() AND r.ROUTINE_TYPE = 'PROCEDURE'
         AND r.ROUTINE_NAME REGEXP '^sp_dash_[A-Za-z0-9_]{1,112}$'
       ORDER BY p.SPECIFIC_NAME, p.ORDINAL_POSITION`,
    );
    const parameters = new Map<
      string,
      Array<{ name: string; type: ReturnType<typeof dashboardType>; mysqlType: string; mode: 'IN' | 'OUT' | 'INOUT'; ordinalPosition: number }>
    >();
    for (const row of parameterRows) {
      const routineName = String(row.routine_name);
      const list = parameters.get(routineName) ?? [];
      list.push({
        name: String(row.parameter_name ?? ''),
        type: dashboardType(row.data_type, row.column_type),
        mysqlType: String(row.data_type),
        mode: routineParamMode(row.parameter_mode),
        ordinalPosition: Number(row.ordinal_position),
      });
      parameters.set(routineName, list);
    }
    return routineRows.map((row) => {
      const securityType = String(row.security_type) === 'INVOKER' ? 'INVOKER' : 'DEFINER';
      return {
        procedureName: String(row.routine_name),
        securityType,
        executable: (parameters.get(String(row.routine_name)) ?? []).every((parameter) => parameter.mode === 'IN'),
        parameters: parameters.get(String(row.routine_name)) ?? [],
      };
    });
  }

  async inspectProcedure(company: CompanyContext, procedureName: string) {
    const procedures = await this.discoverProcedures(company);
    return procedures.find((procedure) => procedure.procedureName === procedureName);
  }

  async getActiveProcedureResultSchema(company: CompanyContext, procedureName: string) {
    const rows = await this.database.queryRows<MetadataRow>(
      company,
      `SELECT result_schema
       FROM dashboard_procedures
       WHERE procedure_name = ? AND status = 'ACTIVE'
       LIMIT 1`,
      [procedureName],
    );
    const value = rows[0]?.result_schema;
    return typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  }

  async saveInferredProcedureResultSchema(
    company: CompanyContext,
    procedureName: string,
    resultSchema: { schemaVersion: 1; columns: Array<{ name: string; type: string }> },
  ) {
    const result = await this.database.execute(
      company,
      `UPDATE dashboard_procedures
       SET result_schema = ?
       WHERE procedure_name = ? AND status = 'ACTIVE'`,
      [JSON.stringify(resultSchema), procedureName],
    );
    if (result.affectedRows !== 1) {
      throw new AppError('No se pudo guardar el esquema porque el procedimiento no está activo en el catálogo.', {
        statusCode: 409,
        code: 'DASHBOARD_PROCEDURE_NOT_ACTIVE',
      });
    }
  }

  async previewProcedure(company: CompanyContext, procedureName: string, values: readonly (string | number | null | Buffer)[], timeoutSeconds: number) {
    return this.database.executeReadOnlyProcedureWithMetadata(company, procedureName, values, timeoutSeconds);
  }
}

export { dashboardType };
