import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCredentials: vi.fn(),
  decrypt: vi.fn(),
  getPool: vi.fn(),
}));

vi.mock('../src/Repositories/CompanyConnectionRepository.js', () => ({
  getCompanyConnectionCredentials: mocks.getCredentials,
}));

vi.mock('../src/Services/CompanyCredentialService.js', () => ({
  companyCredentialService: { decrypt: mocks.decrypt },
}));

vi.mock('../src/Services/CompanyConnectionManager.js', () => ({
  companyConnectionManager: { getPool: mocks.getPool },
}));

import { CompanyConnectionService } from '../src/Services/CompanyConnectionService.js';

const envKeys = [
  'DB_COMPANY_HOST',
  'DB_COMPANY_PORT',
  'DB_COMPANY_SSL',
  'DB_COMPANY_DATABASE',
  'DB_COMPANY_USER',
  'DB_COMPANY_PASSWORD',
  'DB_COMPANY_CONNECTION_LIMIT',
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
] as const;
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

describe('CompanyConnectionService', () => {
  const service = new CompanyConnectionService();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DB_COMPANY_HOST = 'db.example.test';
    process.env.DB_COMPANY_PORT = '3307';
    process.env.DB_COMPANY_SSL = 'false';
    process.env.DB_COMPANY_CONNECTION_LIMIT = '10';
    process.env.MYSQL_HOST = '127.0.0.1';
    process.env.MYSQL_PORT = '3306';
    process.env.MYSQL_USER = 'kindmetrics_app';
    process.env.MYSQL_PASSWORD = 'application-password';
    mocks.getCredentials.mockResolvedValue(undefined);
    mocks.decrypt.mockReturnValue('tenant-password');
    mocks.getPool.mockResolvedValue({ pool: true });
  });

  afterEach(() => {
    for (const key of envKeys) {
      const value = previousEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('uses the configured default database and application credentials for the primary company', async () => {
    process.env.DB_COMPANY_DATABASE = 'KindMetrics';
    process.env.DB_COMPANY_USER = 'partial-company-user';
    delete process.env.DB_COMPANY_PASSWORD;

    await service.getPool({ id: 1, guid: 'primary-guid', code: 'KIND' });

    expect(mocks.getPool).toHaveBeenCalledWith(1, expect.objectContaining({
      host: 'db.example.test',
      port: 3307,
      database: 'KindMetrics',
      username: 'kindmetrics_app',
      password: 'application-password',
      ssl: false,
    }));
  });

  it('uses application credentials when a provisioned company has no tenant credentials', async () => {
    mocks.getCredentials.mockResolvedValue({
      db_name: 'tenant_db',
      db_username: null,
      db_password_encrypted: null,
    });

    await service.getPool({ id: 2, guid: 'tenant-guid', code: 'TENANT' });

    expect(mocks.getPool).toHaveBeenCalledWith(2, expect.objectContaining({
      database: 'tenant_db',
      username: 'kindmetrics_app',
      password: 'application-password',
    }));
  });

  it('prefers valid company-specific credentials when they are configured', async () => {
    mocks.getCredentials.mockResolvedValue({
      db_name: 'tenant_db',
      db_username: 'tenant_user',
      db_password_encrypted: Buffer.from('encrypted'),
    });

    await service.getPool({ id: 2, guid: 'tenant-guid', code: 'TENANT' });

    expect(mocks.decrypt).toHaveBeenCalledWith(Buffer.from('encrypted'));
    expect(mocks.getPool).toHaveBeenCalledWith(2, expect.objectContaining({
      database: 'tenant_db',
      username: 'tenant_user',
      password: 'tenant-password',
    }));
  });

  it('retries rejected company credentials with the shared application account', async () => {
    mocks.getCredentials.mockResolvedValue({
      db_name: 'tenant_db',
      db_username: 'expired_tenant_user',
      db_password_encrypted: Buffer.from('encrypted'),
    });
    const operation = vi.fn()
      .mockRejectedValueOnce({ code: 'ER_ACCESS_DENIED_ERROR', errno: 1045 })
      .mockResolvedValueOnce('connected');

    await expect(service.withFallback(
      { id: 2, guid: 'tenant-guid', code: 'TENANT' },
      operation,
    )).resolves.toBe('connected');

    expect(mocks.getPool).toHaveBeenNthCalledWith(1, 2, expect.objectContaining({
      username: 'expired_tenant_user',
      database: 'tenant_db',
    }));
    expect(mocks.getPool).toHaveBeenNthCalledWith(2, 2, expect.objectContaining({
      username: 'kindmetrics_app',
      password: 'application-password',
      database: 'tenant_db',
    }));
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not map an unconfigured non-primary company to the primary database', async () => {
    await expect(service.getPool({ id: 3, guid: 'new-company-guid', code: 'NEW' }))
      .rejects.toMatchObject({ code: 'COMPANY_DATABASE_NOT_CONFIGURED' });

    expect(mocks.getPool).not.toHaveBeenCalled();
  });
});
