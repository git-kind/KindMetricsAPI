import { verifyDatabaseConnection } from '../Repositories/DatabaseHealthRepository.js';

export class DatabaseService {
  async verifyConnection(): Promise<void> {
    await verifyDatabaseConnection();
  }
}

export const databaseService = new DatabaseService();