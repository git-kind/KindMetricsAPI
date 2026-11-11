import mysql from 'mysql2/promise';
import type { FieldPacket, Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

type SqlExecutor = Pool | PoolConnection;

export type ProcedureResultColumn = {
  name: string;
  type: 'STRING' | 'NUMBER' | 'INTEGER' | 'DATE' | 'DATETIME';
};

function mapProcedureFieldType(type: number | undefined): ProcedureResultColumn['type'] {
  switch (type) {
    case 0:
    case 4:
    case 5:
    case 246:
      return 'NUMBER';
    case 7:
    case 12:
      return 'DATETIME';
    case 10:
    case 14:
      return 'DATE';
    case 1:
    case 2:
    case 3:
    case 8:
    case 9:
    case 13:
      return 'INTEGER';
    default:
      return 'STRING';
  }
}

export function procedureColumnsFromFields(
  fields: FieldPacket[] | FieldPacket[][],
): ProcedureResultColumn[] {
  const firstResultFields = Array.isArray(fields[0]) ? fields[0] : fields as FieldPacket[];
  return firstResultFields
    .filter((field) => field && typeof field.name === 'string' && field.name.length > 0)
    .map((field) => ({
      name: field.name,
      type: mapProcedureFieldType(field.columnType ?? field.type),
    }));
}

export function procedureResultSets<T>(result: unknown): T[][] {
  if (!Array.isArray(result)) {
    return [];
  }

  return result.filter(Array.isArray) as T[][];
}

export async function callStoredProcedure<T>(
  executor: SqlExecutor,
  procedure: string,
  args: readonly (string | number | null | Buffer)[] = [],
  timeout?: number,
): Promise<T[][]> {
  if (!/^sp_[a-zA-Z0-9_]+$/.test(procedure)) {
    throw new Error('Invalid stored procedure name');
  }
  const placeholders = args.map(() => '?').join(',');
  const [result] = await executor.query<RowDataPacket[][]>(
    {
      sql: `CALL ${procedure}(${placeholders})`,
      ...(timeout === undefined ? {} : { timeout }),
    },
    [...args],
  );
  return procedureResultSets<T>(result);
}

export async function executeReadOnlyQuery(
  config: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  },
  sql: string,
  params: (string | number | boolean | null)[],
) {
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    multipleStatements: false,
    connectTimeout: 5_000,
  });
  try {
    await connection.query('SET SESSION TRANSACTION READ ONLY');
    await connection.query('SET SESSION MAX_EXECUTION_TIME=5000');
    const [rows] = await connection.execute(sql, params);
    return rows;
  } finally {
    await connection.end();
  }
}

export async function executeReadOnlyProcedure(
  pool: Pool,
  procedure: string,
  params: readonly (string | number | null | Buffer)[],
  timeoutSeconds: number,
): Promise<RowDataPacket[][]> {
  const result = await executeReadOnlyProcedureWithMetadata(pool, procedure, params, timeoutSeconds);
  return result.resultSets;
}

export async function executeReadOnlyProcedureWithMetadata(
  pool: Pool,
  procedure: string,
  params: readonly (string | number | null | Buffer)[],
  timeoutSeconds: number,
): Promise<{ resultSets: RowDataPacket[][]; columns: ProcedureResultColumn[] }> {
  const connection = await pool.getConnection();
  let reusable = true;
  let transactionStarted = false;
  try {
    await connection.query('SET TRANSACTION READ ONLY');
    await connection.beginTransaction();
    transactionStarted = true;
    if (!/^sp_dash_[a-zA-Z0-9_]{1,112}$/.test(procedure)) {
      throw new Error('Invalid dashboard procedure name');
    }
    const placeholders = params.map(() => '?').join(',');
    const [result, fields] = await connection.query<RowDataPacket[][]>(
      {
        sql: `CALL ${procedure}(${placeholders})`,
        timeout: timeoutSeconds * 1_000,
      },
      [...params],
    );
    const fieldSets = fields as unknown as FieldPacket[] | FieldPacket[][];
    return {
      resultSets: result.filter(Array.isArray) as RowDataPacket[][],
      columns: procedureColumnsFromFields(fieldSets),
    };
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
