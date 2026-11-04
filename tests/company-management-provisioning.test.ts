import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { callRowsMock, encryptMock, initializeMock } = vi.hoisted(() => ({
  callRowsMock: vi.fn(),
  encryptMock: vi.fn(() => Buffer.from('encrypted-password')),
  initializeMock: vi.fn(),
}));

vi.mock('../src/Repositories/StoredProcedures/ProcedureExecutor.js', () => ({
  callRows: callRowsMock,
}));

vi.mock('../src/Services/CompanyCredentialService.js', () => ({
  companyCredentialService: { encrypt: encryptMock },
}));

vi.mock('../src/Services/CompanyDatabaseInitializer.js', () => ({
  companyDatabaseInitializer: { initialize: initializeMock },
}));

import {
  createCompany,
  provisionCompanyDatabase,
} from '../src/Repositories/CompanyManagementRepository.js';

const previousMysqlUser = process.env.MYSQL_USER;

afterEach(() => {
  vi.clearAllMocks();
  if (previousMysqlUser === undefined) delete process.env.MYSQL_USER;
  else process.env.MYSQL_USER = previousMysqlUser;
});

describe('Company provisioning', () => {
  it('grants KindMetrics database access before creating and granting the tenant account', () => {
    for (const file of [
      'DataBaseScripts/0010-management-stored-procedures.sql',
      'DataBaseScripts/0011-company-provisioning-procedure.sql',
    ]) {
      const sql = readFileSync(file, 'utf8');
      expect(sql).toContain(
        "CREATE DEFINER = 'kindmetrics'@'%' PROCEDURE sp_company_management_provision_database",
      );
      const databaseCreation = sql.indexOf("'CREATE DATABASE '");
      const applicationGrant = sql.indexOf("'GRANT ALL PRIVILEGES ON '", databaseCreation);
      const applicationAccount = sql.indexOf('QUOTE(p_application_user)', applicationGrant);
      const tenantUserCreation = sql.indexOf("'CREATE USER '", applicationGrant);
      const tenantGrant = sql.indexOf("'GRANT ALL PRIVILEGES ON '", tenantUserCreation);
      const tenantAccount = sql.indexOf('QUOTE(p_database_user)', tenantGrant);

      expect(databaseCreation).toBeGreaterThanOrEqual(0);
      expect(applicationGrant).toBeGreaterThan(databaseCreation);
      expect(applicationAccount).toBeGreaterThan(applicationGrant);
      expect(tenantUserCreation).toBeGreaterThan(applicationGrant);
      expect(tenantGrant).toBeGreaterThan(tenantUserCreation);
      expect(tenantAccount).toBeGreaterThan(tenantGrant);
    }
  });

  it('uses the application definer only for database provisioning', () => {
    const sql = readFileSync('DataBaseScripts/0010-management-stored-procedures.sql', 'utf8');
    const procedureSecurity = new Map<string, string>();
    const procedurePattern = /CREATE(?: DEFINER = [^\n]+)?\s+PROCEDURE\s+(\w+)\s*\([\s\S]*?\)\s*(SQL SECURITY (?:INVOKER|DEFINER))?\s*BEGIN/g;

    for (const match of sql.matchAll(procedurePattern)) {
      procedureSecurity.set(match[1], match[2] ?? 'SQL SECURITY DEFINER');
    }

    expect(procedureSecurity.get('sp_company_management_provision_database')).toBe('SQL SECURITY DEFINER');
    expect(procedureSecurity.get('sp_company_management_create')).toBe('SQL SECURITY INVOKER');
    expect(procedureSecurity.get('sp_company_management_update')).toBe('SQL SECURITY INVOKER');
    for (const [name, security] of procedureSecurity) {
      if (name !== 'sp_company_management_provision_database') {
        expect(security, name).toBe('SQL SECURITY INVOKER');
      }
    }
  });

  it('keeps company catalog procedures invoker-secured in the provisioning migration', () => {
    const sql = readFileSync('DataBaseScripts/0011-company-provisioning-procedure.sql', 'utf8');

    for (const name of ['sp_company_management_create', 'sp_company_management_update']) {
      expect(sql).toMatch(new RegExp(
        `CREATE PROCEDURE ${name}\\([\\s\\S]*?\\)\\s*SQL SECURITY INVOKER\\b`,
      ));
    }
    expect(sql).toMatch(
      /CREATE DEFINER = 'kindmetrics'@'%' PROCEDURE sp_company_management_provision_database\([\s\S]*?\)\s*SQL SECURITY DEFINER\b/,
    );
    expect(sql).toMatch(/db_password_encrypted = p_password_encrypted,[\s\S]*?status = 'INACTIVE'/);
    expect(sql).toMatch(/db_username = p_database_user,[\s\S]*?db_password_encrypted IS NOT NULL/);
  });

  it('registers company information without provisioning a database', async () => {
    callRowsMock.mockResolvedValueOnce([{
      id: 8,
      guid: 'c7d4a114-40f8-4a19-90f2-8ad590baf3a9',
      name: 'Empresa',
      code: 'EMP',
      razon_social: 'Empresa S.A.',
      rfc: null,
      direccion: null,
      telefono: null,
      created_at: new Date('2026-10-22T00:00:00.000Z'),
      estado: 'inactivo',
      status: 'INACTIVE',
    }]);

    await createCompany({
      name: 'Empresa',
      code: 'EMP',
      razon_social: 'Empresa S.A.',
      rfc: null,
      direccion: null,
      telefono: null,
    });

    expect(callRowsMock).toHaveBeenCalledWith(
      'sp_company_management_create',
      [
        expect.any(String),
        expect.any(String),
      ],
    );
    expect(encryptMock).not.toHaveBeenCalled();
  });

  it('provisions database credentials separately for a registered company', async () => {
    process.env.MYSQL_USER = 'kindmetrics_app';
    const companyRow = {
      id: 8,
      guid: 'c7d4a114-40f8-4a19-90f2-8ad590baf3a9',
      name: 'Empresa',
      code: 'EMP',
      razon_social: 'Empresa S.A.',
      rfc: null,
      direccion: null,
      telefono: null,
      created_at: new Date('2026-10-22T00:00:00.000Z'),
      estado: 'activo',
      status: 'ACTIVE',
    };
    callRowsMock
      .mockResolvedValueOnce([{ ...companyRow, estado: 'inactivo', status: 'INACTIVE' }])
      .mockResolvedValueOnce([companyRow]);

    await provisionCompanyDatabase(8, {
      database_name: 'empresa_01',
      database_user: 'empresa_user',
      database_password: 'plaintext-password',
    });

    expect(callRowsMock).toHaveBeenCalledWith(
      'sp_company_management_provision_database',
      [
        8,
        'empresa_01',
        'empresa_user',
        expect.any(Buffer),
        'plaintext-password',
        'kindmetrics_app',
      ],
    );
    expect(initializeMock).toHaveBeenCalledWith({
      database: 'empresa_01',
      username: 'empresa_user',
      password: 'plaintext-password',
    });
    expect(callRowsMock).toHaveBeenLastCalledWith(
      'sp_company_management_update',
      [8, JSON.stringify({ estado: 'activo' }), null],
    );
    expect(encryptMock).toHaveBeenCalledWith('plaintext-password');
  });

  it('leaves the company inactive when tenant migrations fail', async () => {
    process.env.MYSQL_USER = 'kindmetrics_app';
    callRowsMock.mockResolvedValueOnce([{
      id: 8,
      guid: 'c7d4a114-40f8-4a19-90f2-8ad590baf3a9',
      name: 'Empresa',
      code: 'EMP',
      razon_social: 'Empresa S.A.',
      rfc: null,
      direccion: null,
      telefono: null,
      created_at: new Date('2026-10-22T00:00:00.000Z'),
      estado: 'inactivo',
      status: 'INACTIVE',
    }]);
    initializeMock.mockRejectedValueOnce({ code: 'ER_ACCESS_DENIED_ERROR' });

    await expect(provisionCompanyDatabase(8, {
      database_name: 'empresa_01',
      database_user: 'empresa_user',
      database_password: 'plaintext-password',
    })).rejects.toMatchObject({
      statusCode: 503,
      code: 'COMPANY_DATABASE_INITIALIZATION_FAILED',
    });

    expect(callRowsMock).toHaveBeenCalledTimes(1);
  });

  it('deactivates newly provisioned companies returned active by the old procedure', async () => {
    process.env.MYSQL_USER = 'kindmetrics_app';
    const activeCompany = {
      id: 8,
      guid: 'c7d4a114-40f8-4a19-90f2-8ad590baf3a9',
      name: 'Empresa',
      code: 'EMP',
      razon_social: 'Empresa S.A.',
      rfc: null,
      direccion: null,
      telefono: null,
      created_at: new Date('2026-10-22T00:00:00.000Z'),
      estado: 'activo',
      status: 'ACTIVE',
    };
    callRowsMock
      .mockResolvedValueOnce([activeCompany])
      .mockResolvedValueOnce([{ ...activeCompany, estado: 'inactivo', status: 'INACTIVE' }]);

    await expect(provisionCompanyDatabase(8, {
      database_name: 'empresa_01',
      database_user: 'empresa_user',
      database_password: 'plaintext-password',
    })).rejects.toMatchObject({
      statusCode: 503,
      code: 'COMPANY_PROCEDURE_MIGRATION_REQUIRED',
    });

    expect(callRowsMock).toHaveBeenLastCalledWith('sp_company_management_deactivate', [8]);
    expect(initializeMock).not.toHaveBeenCalled();
  });

  it('rejects reusing the KindMetrics account as the tenant account', async () => {
    process.env.MYSQL_USER = 'kindmetrics_app';

    await expect(provisionCompanyDatabase(8, {
      database_name: 'empresa_01',
      database_user: 'KINDMETRICS_APP',
      database_password: 'plaintext-password',
    })).rejects.toMatchObject({
      code: 'COMPANY_DATABASE_USER_CONFLICTS_WITH_APPLICATION_USER',
      statusCode: 422,
    });

    expect(callRowsMock).not.toHaveBeenCalled();
  });

  it('reports the procedure migration when MySQL still has the old signature', async () => {
    process.env.MYSQL_USER = 'kindmetrics_app';
    callRowsMock.mockRejectedValueOnce({ code: 'ER_SP_WRONG_NO_OF_ARGS' });

    await expect(provisionCompanyDatabase(8, {
      database_name: 'empresa_01',
      database_user: 'empresa_user',
      database_password: 'plaintext-password',
    })).rejects.toMatchObject({
      code: 'COMPANY_PROCEDURE_MIGRATION_REQUIRED',
      statusCode: 503,
      message: expect.stringContaining('0011-company-provisioning-procedure.sql'),
    });
  });
});
