import type { RowDataPacket } from 'mysql2';
import { callRows } from './StoredProcedures/ProcedureExecutor.js';

export async function verifyDatabaseConnection(): Promise<void> {
  const [result] = await callRows<{ connected: number } & RowDataPacket>('sp_database_health_check');
  if (Number(result?.connected) !== 1) {
    throw new Error('Database health check returned an unexpected result.');
  }
}
