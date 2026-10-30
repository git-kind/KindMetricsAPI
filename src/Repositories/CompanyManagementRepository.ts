import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../Config/DatabaseConfig.js';
import { AppError } from '../Errors/AppError.js';
import type { CompanyManagementDto } from '../Models/Companies/CompanyManagementDto.js';

type CompanyRow = RowDataPacket & {
  id: number;
  guid: string;
  name: string;
  code: string;
  razon_social: string;
  rfc: string | null;
  direccion: string | null;
  telefono: string | null;
  database_name: string | null;
  database_user: string | null;
  created_at: Date | string | null;
  estado: 'activo' | 'inactivo' | null;
  status: string;
};

type CompanyManagementUserRow = RowDataPacket & {
  perfil: 'Admin' | 'Visor';
  status: string;
};

type CompanyCodeRow = RowDataPacket & {
  id: number;
  guid: string;
  code: string;
  status: string;
};

const selectCompanyColumns = `
  SELECT id, guid, name, code, razon_social, rfc, direccion, telefono,
         database_name, database_user, created_at, estado, status
  FROM companies
  WHERE 1 = 1`;

function toDto(row: CompanyRow): CompanyManagementDto {
  return {
    id: row.id,
    guid: row.guid,
    name: row.name,
    code: row.code,
    razon_social: row.razon_social,
    rfc: row.rfc,
    direccion: row.direccion,
    telefono: row.telefono,
    database_name: row.database_name,
    database_user: row.database_user,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    estado: row.estado?.toLowerCase() === 'inactivo' || row.status.toUpperCase() === 'INACTIVE' ? 'inactivo' : 'activo',
  };
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}

function throwIfDuplicateCompanyCode(error: unknown): never {
  if (isDuplicateKey(error)) {
    throw new AppError('Ya existe una empresa registrada con ese código.', {
      statusCode: 409,
      code: 'COMPANY_CODE_ALREADY_EXISTS',
      field: 'code',
    });
  }
  throw error;
}

export async function listCompanies(): Promise<CompanyManagementDto[]> {
  const [rows] = await pool.execute<CompanyRow[]>(`${selectCompanyColumns} ORDER BY id`);
  return rows.map(toDto);
}

export async function getCompanyManagementUserProfile(guid: string): Promise<'Admin' | 'Visor' | undefined> {
  const [rows] = await pool.execute<CompanyManagementUserRow[]>(
    `SELECT perfil
     FROM users
     WHERE guid = ?
       AND UPPER(TRIM(status)) IN ('ACTIVE', 'ACTIVO')
     LIMIT 1`,
    [guid],
  );
  return rows[0]?.perfil;
}

export async function resolveCompanyByCode(code: string) {
  const [rows] = await pool.execute<CompanyCodeRow[]>(
    `SELECT id, guid, code, status
     FROM companies
     WHERE code = ?
     LIMIT 1`,
    [code],
  );
  return rows[0];
}

export async function getCompanyById(id: number): Promise<CompanyManagementDto | undefined> {
  const [rows] = await pool.execute<CompanyRow[]>(`${selectCompanyColumns} AND id = ? LIMIT 1`, [id]);
  return rows[0] ? toDto(rows[0]) : undefined;
}

export async function createCompany(input: {
  name: string;
  code: string;
  razon_social: string;
  rfc: string | null;
  direccion: string | null;
  telefono: string | null;
  database_name: string;
  database_user: string;
  database_password: string;
}): Promise<CompanyManagementDto> {
  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO companies
        (guid, name, code, razon_social, rfc, direccion, telefono,
         database_name, database_user, database_password, status, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'activo')`,
      [
        randomUUID(),
        input.name,
        input.code,
        input.razon_social,
        input.rfc,
        input.direccion,
        input.telefono,
        input.database_name,
        input.database_user,
        encryptCompanyPassword(input.database_password),
      ],
    );
    const created = await getCompanyById(result.insertId);
    if (!created) {
      throw new AppError('No se pudo recuperar la empresa recién creada.', {
        code: 'COMPANY_CREATE_FAILED',
      });
    }
    return created;
  } catch (error) {
    return throwIfDuplicateCompanyCode(error);
  }
}

export async function updateCompany(
  id: number,
  input: {
    name?: string;
    code?: string;
    razon_social?: string;
    rfc?: string | null;
    direccion?: string | null;
    telefono?: string | null;
    database_name?: string;
    database_user?: string;
    database_password?: string;
    estado?: 'activo' | 'inactivo';
  },
): Promise<CompanyManagementDto | undefined> {
  const assignments: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.name !== undefined) {
    assignments.push('name = ?');
    values.push(input.name);
  }
  if (input.code !== undefined) {
    assignments.push('code = ?');
    values.push(input.code);
  }
  if (input.razon_social !== undefined) {
    assignments.push('razon_social = ?');
    values.push(input.razon_social);
  }
  if (input.rfc !== undefined) {
    assignments.push('rfc = ?');
    values.push(input.rfc);
  }
  if (input.direccion !== undefined) {
    assignments.push('direccion = ?');
    values.push(input.direccion);
  }
  if (input.telefono !== undefined) {
    assignments.push('telefono = ?');
    values.push(input.telefono);
  }
  if (input.database_name !== undefined) {
    assignments.push('database_name = ?');
    values.push(input.database_name);
  }
  if (input.database_user !== undefined) {
    assignments.push('database_user = ?');
    values.push(input.database_user);
  }
  if (input.database_password !== undefined) {
    assignments.push('database_password = ?');
    values.push(encryptCompanyPassword(input.database_password));
  }
  if (input.estado !== undefined) {
    const databaseStatus = input.estado === 'activo' ? 'ACTIVE' : 'INACTIVE';
    assignments.push('estado = ?', 'status = ?');
    values.push(input.estado, databaseStatus);
  }

  try {
    values.push(id);
    await pool.execute<ResultSetHeader>(`UPDATE companies SET ${assignments.join(', ')} WHERE id = ?`, values);
    return getCompanyById(id);
  } catch (error) {
    return throwIfDuplicateCompanyCode(error);
  }
}

export async function deactivateCompany(id: number): Promise<CompanyManagementDto | undefined> {
  await pool.execute<ResultSetHeader>(
    `UPDATE companies
     SET estado = 'inactivo', status = 'INACTIVE'
     WHERE id = ?`,
    [id],
  );
  return getCompanyById(id);
}

function companyCredentialsKey(): Buffer {
  const encoded = process.env.COMPANY_CREDENTIALS_ENCRYPTION_KEY;
  if (!encoded || !/^[0-9a-f]{64}$/i.test(encoded)) {
    throw new AppError(
      'La clave de cifrado de credenciales de empresas no está configurada correctamente.',
      { code: 'COMPANY_CREDENTIALS_KEY_MISSING' },
    );
  }
  return Buffer.from(encoded, 'hex');
}

function encryptCompanyPassword(password: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', companyCredentialsKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export async function testCompanyConnection(input: {
  database_name: string;
  database_user: string;
  database_password: string;
}): Promise<{ database_name: string; connected: true }> {
  const identifier = `\`${input.database_name.replace(/`/g, '``')}\``;
  const userIdentifier = `\`${input.database_user.replace(/`/g, '``')}\``;
  const escapedPassword = mysql.escape(input.database_password);
  let connection: mysql.Connection | undefined;
  try {
    const adminConnection = await mysql.createConnection({
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      connectTimeout: 5000,
    });
    try {
      await adminConnection.query(`CREATE DATABASE IF NOT EXISTS ${identifier}`);
      await adminConnection.query(
        `CREATE USER IF NOT EXISTS ${userIdentifier}@'127.0.0.1' IDENTIFIED BY ${escapedPassword}`,
      );
      await adminConnection.query(
        `ALTER USER ${userIdentifier}@'127.0.0.1' IDENTIFIED BY ${escapedPassword}`,
      );
      await adminConnection.query(
        `GRANT ALL PRIVILEGES ON ${identifier}.* TO ${userIdentifier}@'127.0.0.1'`,
      );
      await adminConnection.query(
        `CREATE USER IF NOT EXISTS ${userIdentifier}@'localhost' IDENTIFIED BY ${escapedPassword}`,
      );
      await adminConnection.query(
        `ALTER USER ${userIdentifier}@'localhost' IDENTIFIED BY ${escapedPassword}`,
      );
      await adminConnection.query(
        `GRANT ALL PRIVILEGES ON ${identifier}.* TO ${userIdentifier}@'localhost'`,
      );
      await adminConnection.query(
        `CREATE USER IF NOT EXISTS ${userIdentifier}@'%' IDENTIFIED BY ${escapedPassword}`,
      );
      await adminConnection.query(
        `ALTER USER ${userIdentifier}@'%' IDENTIFIED BY ${escapedPassword}`,
      );
      await adminConnection.query(
        `GRANT ALL PRIVILEGES ON ${identifier}.* TO ${userIdentifier}@'%'`,
      );
      await adminConnection.query('FLUSH PRIVILEGES');
    } finally {
      await adminConnection.end();
    }

    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: input.database_user,
      password: input.database_password,
      database: input.database_name,
      connectTimeout: 5000,
    });
    await connection.query('SELECT 1');
    return { database_name: input.database_name, connected: true };
  } catch (error) {
    const databaseError =
      error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'UNKNOWN_DATABASE_ERROR';
    throw new AppError(`No se pudo crear o probar la conexión de la empresa (${databaseError}).`, {
      statusCode: 422,
      code: 'COMPANY_CONNECTION_TEST_FAILED',
    });
  } finally {
    await connection?.end();
  }
}
