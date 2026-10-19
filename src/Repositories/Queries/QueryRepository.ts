import mysql from 'mysql2/promise';
export async function executeReadOnly(config: { host: string; port: number; database: string; username: string; password: string }, sql: string, params: (string | number | boolean | null)[]) {
  const connection = await mysql.createConnection({ host: config.host, port: config.port, database: config.database, user: config.username, password: config.password, multipleStatements: false, connectTimeout: 5000 });
  try {
    await connection.query('SET SESSION TRANSACTION READ ONLY');
    await connection.query('SET SESSION MAX_EXECUTION_TIME=5000');
    const [rows] = await connection.execute(sql, params);
    return rows;
  } finally { await connection.end(); }
}
