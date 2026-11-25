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
    const selection = await this.getPoolSelection(company);
    return selection.pool;
  }

  async withFallback<T>(
    company: CompanyContext,
    operation: (pool: Awaited<ReturnType<typeof companyConnectionManager.getPool>>) => Promise<T>,
  ): Promise<T> {
    const selection = await this.getPoolSelection(company);
    try {
      return await operation(selection.pool);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      const errno = error && typeof error === 'object' && 'errno' in error ? error.errno : undefined;
      if (selection.usesSharedCredentials || (code !== 'ER_ACCESS_DENIED_ERROR' && errno !== 1045)) {
        throw error;
      }

      const fallback = await this.getPoolSelection(company, true);
      return operation(fallback.pool);
    }
  }

  private async getPoolSelection(company: CompanyContext, forceSharedCredentials = false) {
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
    const primaryDatabase = company.code?.trim().toUpperCase() === 'KIND'
      ? process.env.DB_COMPANY_DATABASE?.trim()
      : undefined;
    const database = credentials?.db_name?.trim() || primaryDatabase;
    if (!database) {
      throw new AppError('La compañía no tiene configurada una base de datos.', {
        statusCode: 503,
        code: 'COMPANY_DATABASE_NOT_CONFIGURED',
      });
    }

    const host = process.env.DB_COMPANY_HOST?.trim() || process.env.MYSQL_HOST?.trim();
    if (!host) {
      throw new AppError('DB_COMPANY_HOST ni MYSQL_HOST están configurados.', {
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
    const port = positiveInteger(process.env.DB_COMPANY_PORT, positiveInteger(process.env.MYSQL_PORT, 3306));
    const connectionLimit = positiveInteger(process.env.DB_COMPANY_CONNECTION_LIMIT, 10);
    const companyUser = process.env.DB_COMPANY_USER?.trim();
    const companyPassword = process.env.DB_COMPANY_PASSWORD;
    const mysqlUser = process.env.MYSQL_USER?.trim();
    const mysqlPassword = process.env.MYSQL_PASSWORD;
    const hasCompanyCredentials = Boolean(companyUser && companyPassword);
    const sharedUser = hasCompanyCredentials ? companyUser : mysqlUser;
    const sharedPassword = hasCompanyCredentials ? companyPassword : mysqlPassword;
    const storedUsername = credentials?.db_username;
    const storedPassword = credentials?.db_password_encrypted;
    const usesSharedCredentials = forceSharedCredentials || !storedUsername || !storedPassword;
    let username: string;
    let password: string;
    if (!usesSharedCredentials && storedUsername && storedPassword) {
      username = storedUsername;
      password = companyCredentialService.decrypt(storedPassword);
    } else {
      if (!sharedUser || !sharedPassword) {
        throw new AppError('No hay credenciales de aplicación para conectar con la base de datos de la empresa.', {
          statusCode: 503,
          code: 'COMPANY_DATABASE_CONFIGURATION_INVALID',
        });
      }
      username = sharedUser;
      password = sharedPassword;
    }

    const config: CompanyPoolConfig = {
      host,
      port,
      database,
      username,
      password,
      ssl: sslValue === 'true',
      connectionLimit,
    };
    return {
      pool: await companyConnectionManager.getPool(company.id, config),
      usesSharedCredentials,
    };
  }
}

export const companyConnectionService = new CompanyConnectionService();
