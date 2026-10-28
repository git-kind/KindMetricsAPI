import { randomUUID } from 'node:crypto';
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
  SELECT id, guid, name, code, razon_social, rfc, direccion, telefono, created_at, estado, status
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
}): Promise<CompanyManagementDto> {
  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO companies
        (guid, name, code, razon_social, rfc, direccion, telefono, status, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'activo')`,
      [randomUUID(), input.name, input.code, input.razon_social, input.rfc, input.direccion, input.telefono],
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
