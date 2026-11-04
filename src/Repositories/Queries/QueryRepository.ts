import { executeReadOnlyQuery } from '../../Database/SqlExecutor.js';
export async function executeReadOnly(config: { host: string; port: number; database: string; username: string; password: string }, sql: string, params: (string | number | boolean | null)[]) {
  return executeReadOnlyQuery(config, sql, params);
}
