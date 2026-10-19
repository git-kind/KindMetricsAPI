import { pool } from '../Config/DatabaseConfig.js';

export class DatabaseService {
  async verifyConnection(): Promise<void> {
    await pool.query('SELECT 1');
  }
}

export const databaseService = new DatabaseService();