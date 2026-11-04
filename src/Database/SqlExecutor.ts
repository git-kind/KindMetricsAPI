import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

type SqlExecutor = Pool | PoolConnection;

export async function callStoredProcedure<T>(
  executor: SqlExecutor,
  procedure: string,
  args: readonly (string | number | null | Buffer)[] = [],
  timeout?: number,
): Promise<T[][]> {
  if (!/^sp_[a-z0-9_]+$/.test(procedure)) {
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
  return result.filter(Array.isArray) as T[][];
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
  const connection = await pool.getConnection();
  let reusable = true;
  let transactionStarted = false;
  try {
    await connection.query('SET TRANSACTION READ ONLY');
    await connection.beginTransaction();
    transactionStarted = true;
    const resultSets = await callStoredProcedure<RowDataPacket>(
      connection,
      procedure,
      params,
      timeoutSeconds * 1_000,
    );
    return resultSets;
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
