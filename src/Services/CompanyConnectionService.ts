import type { RowDataPacket } from 'mysql2';
import { pool as administrativePool } from '../Config/DatabaseConfig.js';
import { AppError } from '../Errors/AppError.js';
import type { CompanyContext } from '../Models/Common.js';
import { companyCredentialService } from './CompanyCredentialService.js';
import { companyConnectionManager, type CompanyPoolConfig } from './CompanyConnectionManager.js';

type CompanyConnectionRow = RowDataPacket & {
  db_name: string | null;
  db_username: string | null;
  db_password_encrypted: Buffer | null;
};

function positiveInteger(value: string | undefined, defaultValue: number): number {
  const parsed = Number(value ?? defaultValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new AppError('La configuración de conexión de Company es inválida.', {
      statusCode: 503,
      code: 'COMPANY_DATABASE_CONFIGURATION_INVALID',
    });
  }
  return parsed;
}

export class CompanyConnectionService {
  async getPool(company: CompanyContext) {
    let rows: CompanyConnectionRow[];
    try {
      [rows] = await administrativePool.execute<CompanyConnectionRow[]>(
        `SELECT db_name, db_username, db_password_encrypted
         FROM companies
         WHERE id = ? AND guid = ? AND UPPER(TRIM(status)) = 'ACTIVE'
         LIMIT 1`,
        [company.id, company.guid],
      );
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_BAD_FIELD_ERROR') {
        throw new AppError('El catalogo administrativo requiere la migracion de conexiones de Company.', {
          statusCode: 503,
          code: 'COMPANY_DATABASE_CATALOG_MIGRATION_REQUIRED',
        });
      }
      throw error;
    }
    const credentials = rows[0];
    if (!credentials?.db_name || !credentials.db_username || !credentials.db_password_encrypted) {
      throw new AppError('La compañía no tiene configuradas credenciales de base de datos.', {
        statusCode: 503,
        code: 'COMPANY_DATABASE_NOT_CONFIGURED',
      });
    }

    const host = process.env.DB_COMPANY_HOST;
    if (!host) {
      throw new AppError('DB_COMPANY_HOST no está configurado.', {
        statusCode: 503,
        code: 'COMPANY_DATABASE_CONFIGURATION_INVALID',
      });
    }
    const sslValue = (process.env.DB_COMPANY_SSL ?? 'false').toLowerCase();
    if (!['true', 'false'].includes(sslValue)) {
      throw new AppError('DB_COMPANY_SSL debe ser true o false.', {
        statusCode: 503,
        code: 'COMPANY_DATABASE_CONFIGURATION_INVALID',
      });
    }
    const config: CompanyPoolConfig = {
      host,
      port: positiveInteger(process.env.DB_COMPANY_PORT, 3306),
      database: credentials.db_name,
      username: credentials.db_username,
      password: companyCredentialService.decrypt(credentials.db_password_encrypted),
      ssl: sslValue === 'true',
      connectionLimit: positiveInteger(process.env.DB_COMPANY_CONNECTION_LIMIT, 10),
    };
    return companyConnectionManager.getPool(company.id, config);
  }
}

export const companyConnectionService = new CompanyConnectionService();
