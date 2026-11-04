import { pool } from '../../Config/DatabaseConfig.js';
import { callStoredProcedure } from '../../Database/SqlExecutor.js';

export async function callRows<T>(
  name: string,
  args: (string | number | null | Buffer)[] = [],
): Promise<T[]> {
  const resultSets = await callStoredProcedure<T>(pool, name, args);
  return resultSets[0] ?? [];
}
