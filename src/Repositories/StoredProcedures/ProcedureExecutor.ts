import { pool } from '../../Config/DatabaseConfig.js';
import type { RowDataPacket } from 'mysql2';
export async function callRows<T>(name: string, args: (string | number | null)[]): Promise<T[]> {
  if (!/^sp_[a-z0-9_]+$/.test(name)) throw new Error('Invalid procedure');
  const placeholders = args.map(() => '?').join(',');
  const [result] = await pool.query<RowDataPacket[][]>(`CALL ${name}(${placeholders})`, args);
  return (result[0] ?? []) as T[];
}
