import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createConnectionMock, queryMock, endMock } = vi.hoisted(() => ({
  createConnectionMock: vi.fn(),
  queryMock: vi.fn(),
  endMock: vi.fn(),
}));

vi.mock('mysql2/promise', () => ({
  default: { createConnection: createConnectionMock },
}));

import { CompanyDatabaseInitializer, splitSqlStatements } from '../src/Services/CompanyDatabaseInitializer.js';

const previousCompanyDatabaseConfig = {
  host: process.env.DB_COMPANY_HOST,
  port: process.env.DB_COMPANY_PORT,
  ssl: process.env.DB_COMPANY_SSL,
};

describe('CompanyDatabaseInitializer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DB_COMPANY_HOST = 'db.example.test';
    process.env.DB_COMPANY_PORT = '3307';
    process.env.DB_COMPANY_SSL = 'true';
    queryMock.mockImplementation((sql: string) =>
      sql === 'SELECT DATABASE() AS database_name' ? Promise.resolve([[{ database_name: 'tenant_db' }], []]) : Promise.resolve([[], []]),
    );
    endMock.mockResolvedValue(undefined);
    createConnectionMock.mockResolvedValue({ query: queryMock, end: endMock });
  });

  afterEach(() => {
    if (previousCompanyDatabaseConfig.host === undefined) delete process.env.DB_COMPANY_HOST;
    else process.env.DB_COMPANY_HOST = previousCompanyDatabaseConfig.host;
    if (previousCompanyDatabaseConfig.port === undefined) delete process.env.DB_COMPANY_PORT;
    else process.env.DB_COMPANY_PORT = previousCompanyDatabaseConfig.port;
    if (previousCompanyDatabaseConfig.ssl === undefined) delete process.env.DB_COMPANY_SSL;
    else process.env.DB_COMPANY_SSL = previousCompanyDatabaseConfig.ssl;
  });

  it('splits procedure definitions using the script DELIMITER directives', () => {
    const statements = splitSqlStatements(
      [
        'CREATE TABLE sample (id INT);',
        'DELIMITER $$',
        'CREATE PROCEDURE sp_sample()',
        'BEGIN',
        '  SELECT 1;',
        '  SELECT 2;',
        'END$$',
        'DELIMITER ;',
        'SELECT 3;',
      ].join('\n'),
    );

    expect(statements).toEqual(['CREATE TABLE sample (id INT)', 'CREATE PROCEDURE sp_sample()\nBEGIN\n  SELECT 1;\n  SELECT 2;\nEND', 'SELECT 3']);
  });

  it('runs dashboard, tab, panel, and procedure migrations on the tenant connection', async () => {
    const initializer = new CompanyDatabaseInitializer();
    await initializer.initialize({
      database: 'tenant_db',
      username: 'tenant_user',
      password: 'tenant-password',
    });

    expect(createConnectionMock).toHaveBeenCalledWith({
      host: 'db.example.test',
      port: 3307,
      database: 'tenant_db',
      user: 'tenant_user',
      password: 'tenant-password',
      connectTimeout: 5000,
      multipleStatements: false,
      ssl: {},
    });
    const statements = queryMock.mock.calls.map(([sql]) => sql);
    const expectedMigrationStatements = [
      'CREATE TABLE IF NOT EXISTS dashboards',
      'CREATE PROCEDURE sp_dashboard_list',
      'CREATE TABLE IF NOT EXISTS dashboard_tabs',
      'CREATE TABLE IF NOT EXISTS dashboard_panels',
      'CREATE PROCEDURE sp_dashboard_tab_list',
      'CREATE PROCEDURE sp_dashboard_panel_list',
      'CREATE TABLE IF NOT EXISTS dashboard_procedures',
      'CREATE PROCEDURE sp_dashboard_procedure_list',
      'CREATE PROCEDURE sp_dashboard_procedure_sync_no_parameter',
      'CREATE PROCEDURE sp_dashboard_procedure_result_schema_sync',
      'CREATE PROCEDURE sp_dashboard_procedure_create',
    ];
    const statementIndexes = expectedMigrationStatements.map((expected) => statements.findIndex((statement) => statement.includes(expected)));
    expect(statementIndexes.every((index) => index >= 0)).toBe(true);
    expect(statementIndexes).toEqual([...statementIndexes].sort((a, b) => a - b));
    const procedureCreate = statements.find((statement) => statement.includes('CREATE PROCEDURE sp_dashboard_procedure_create'));
    const procedureUpdate = statements.find((statement) => statement.includes('CREATE PROCEDURE sp_dashboard_procedure_update'));
    const panelCreate = [...statements].reverse().find((statement) => statement.includes('CREATE PROCEDURE sp_dashboard_panel_create'));
    expect(procedureCreate).toContain('^sp_dash_[A-Za-z0-9_]{1,112}$');
    expect(procedureCreate).toContain("'ACTIVE'");
    expect(procedureCreate).not.toContain("SECURITY_TYPE = 'INVOKER'");
    expect(procedureUpdate).toContain('^sp_dash_[A-Za-z0-9_]{1,112}$');
    expect(procedureUpdate).not.toContain("SECURITY_TYPE = 'INVOKER'");
    const procedureSync = statements.find((statement) => statement.includes('CREATE PROCEDURE sp_dashboard_procedure_sync_no_parameter'));
    expect(procedureSync).not.toContain("SECURITY_TYPE = 'INVOKER'");
    expect(procedureUpdate).not.toContain('DASHBOARD_PROCEDURE_REVIEW_REQUIRED');
    expect(panelCreate).toContain("'PANEL'");
    expect(endMock).toHaveBeenCalledOnce();
  });

  it('rejects a connection that selects a different database', async () => {
    queryMock.mockResolvedValueOnce([[{ database_name: 'another_db' }], []]);
    const initializer = new CompanyDatabaseInitializer();

    await expect(
      initializer.initialize({
        database: 'tenant_db',
        username: 'tenant_user',
        password: 'tenant-password',
      }),
    ).rejects.toMatchObject({
      code: 'COMPANY_DATABASE_INITIALIZATION_FAILED',
    });
    expect(queryMock).toHaveBeenCalledOnce();
    expect(endMock).toHaveBeenCalledOnce();
  });
});
