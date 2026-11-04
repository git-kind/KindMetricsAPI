import { AppError } from '../Errors/AppError.js';
import type { CompanyContext } from '../Models/Common.js';
import { getCompanyConnectionCredentials } from '../Repositories/CompanyConnectionRepository.js';
import { companyCredentialService } from './CompanyCredentialService.js';
import { companyConnectionManager, type CompanyPoolConfig } from './CompanyConnectionManager.js';

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
    let credentials: Awaited<ReturnType<typeof getCompanyConnectionCredentials>>;
    try {
      credentials = await getCompanyConnectionCredentials(company);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ER_BAD_FIELD_ERROR'
      ) {
        throw new AppError('El catalogo administrativo requiere la migracion de conexiones de Company.', {
          statusCode: 503,
          code: 'COMPANY_DATABASE_CATALOG_MIGRATION_REQUIRED',
        });
      }
      throw error;
    }
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
