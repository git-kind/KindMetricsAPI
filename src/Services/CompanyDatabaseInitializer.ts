import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import type { Connection, ConnectionOptions } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { AppError } from '../Errors/AppError.js';

const migrationFiles = [
  '0001-dashboards-schema.sql',
  '0002-dashboards-procedures.sql',
  '0003-dashboard-tabs-panels-schema.sql',
  '0004-dashboard-tabs-panels-procedures.sql',
  '0005-dashboard-tabs-seed-and-duplication.sql',
  '0006-dashboard-refresh-settings.sql',
  '0007-dashboard-procedure-catalog.sql',
  '0008-dashboard-panel-procedure-link.sql',
  '0009-dashboard-duplication-procedure-links.sql',
  '0010-dashboard-time-series.sql',
];

export interface CompanyDatabaseInitializationConfig {
  database: string;
  username: string;
  password: string;
}

type ConnectionFactory = (options: ConnectionOptions) => Promise<Connection>;

function getMigrationDirectory(): string {
  const candidates = [
    resolve(process.cwd(), 'DataBaseScripts'),
    resolve(dirname(fileURLToPath(import.meta.url)), '../../DataBaseScripts'),
  ];
  const directory = candidates.find((candidate) =>
    migrationFiles.every((file) => existsSync(resolve(candidate, file))),
  );
  if (!directory) {
    throw new AppError('No se encontraron los scripts para inicializar la base de la empresa.', {
      statusCode: 503,
      code: 'COMPANY_DATABASE_MIGRATIONS_UNAVAILABLE',
    });
  }
  return directory;
}

function connectionOptions(config: CompanyDatabaseInitializationConfig): ConnectionOptions {
  const host = process.env.DB_COMPANY_HOST?.trim();
  const port = Number(process.env.DB_COMPANY_PORT ?? 3306);
  const sslValue = (process.env.DB_COMPANY_SSL ?? 'false').toLowerCase();
  if (!host || !Number.isInteger(port) || port < 1 || port > 65_535 || !['true', 'false'].includes(sslValue)) {
    throw new AppError('La configuración de conexión a la base de la empresa es inválida.', {
      statusCode: 503,
      code: 'COMPANY_DATABASE_CONFIGURATION_INVALID',
    });
  }
  return {
    host,
    port,
    database: config.database,
    user: config.username,
    password: config.password,
    connectTimeout: 5_000,
    multipleStatements: false,
    ...(sslValue === 'true' ? { ssl: {} } : {}),
  };
}

export function splitSqlStatements(script: string): string[] {
  let delimiter = ';';
  let buffer = '';
  const statements: string[] = [];

  for (const line of script.split(/\r?\n/)) {
    const delimiterDirective = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (delimiterDirective) {
      const nextDelimiter = delimiterDirective[1];
      if (nextDelimiter) delimiter = nextDelimiter;
      continue;
    }

    buffer += `${line}\n`;
    let delimiterIndex = buffer.indexOf(delimiter);
    while (delimiterIndex >= 0) {
      const statement = buffer.slice(0, delimiterIndex).trim();
      if (statement) statements.push(statement);
      buffer = buffer.slice(delimiterIndex + delimiter.length);
      delimiterIndex = buffer.indexOf(delimiter);
    }
  }

  const remaining = buffer.trim();
  if (remaining) statements.push(remaining);
  return statements;
}

export class CompanyDatabaseInitializer {
  constructor(
    private readonly createConnection: ConnectionFactory = mysql.createConnection,
    private readonly migrationDirectory = getMigrationDirectory(),
  ) {}

  async initialize(config: CompanyDatabaseInitializationConfig): Promise<void> {
    const connection = await this.createConnection(connectionOptions(config));
    try {
      const [identityRows] = await connection.query<(RowDataPacket & { database_name: string })[]>(
        'SELECT DATABASE() AS database_name',
      );
      if (identityRows[0]?.database_name !== config.database) {
        throw new AppError('La conexión no corresponde a la base de datos de la empresa.', {
          statusCode: 503,
          code: 'COMPANY_DATABASE_INITIALIZATION_FAILED',
        });
      }

      for (const file of migrationFiles) {
        const script = await readFile(resolve(this.migrationDirectory, file), 'utf8');
        for (const statement of splitSqlStatements(script)) {
          await connection.query(statement);
        }
      }
    } finally {
      await connection.end();
    }
  }
}

export const companyDatabaseInitializer = new CompanyDatabaseInitializer();
