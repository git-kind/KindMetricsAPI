import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../Config/DatabaseConfig.js';
import { AppError } from '../Errors/AppError.js';
import type { ManagedUserDto } from '../Models/Users/UserManagementDto.js';

const SYSTEM_ADMIN_EMAIL = 'admin@kindtech.com';

type ManagedUserRow = RowDataPacket & {
  id: number;
  nombre: string;
  email: string;
  perfil: 'Admin' | 'Visor';
  fecha_alta: Date;
  estatus: string;
};

type ProfileRow = RowDataPacket & {
  perfil: 'Admin' | 'Visor';
  estatus: string;
};

function normalizeStatus(status: string): 'Activo' | 'Inactivo' {
  return status.trim().toUpperCase() === 'ACTIVE' || status.trim().toUpperCase() === 'ACTIVO' ? 'Activo' : 'Inactivo';
}

function toDto(row: ManagedUserRow): ManagedUserDto {
  return {
    id: row.id,
    nombre: row.nombre,
    email: row.email,
    perfil: row.perfil,
    fecha_alta: row.fecha_alta.toISOString(),
    estatus: normalizeStatus(row.estatus),
  };
}

function isDuplicateEmail(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}

function databaseStatus(status: 'Activo' | 'Inactivo'): 'ACTIVE' | 'INACTIVE' {
  return status === 'Activo' ? 'ACTIVE' : 'INACTIVE';
}

function systemAdminError(): AppError {
  return new AppError('El usuario Administrador del Sistema está blindado y no puede ser eliminado ni desactivar su cuenta', {
    statusCode: 403,
    code: 'SYSTEM_ADMIN_PROTECTED',
  });
}

const selectUserColumns = `
  SELECT
    id,
    name AS nombre,
    email,
    perfil,
    COALESCE(created_at, CURRENT_TIMESTAMP) AS fecha_alta,
    status AS estatus
  FROM users`;

export async function listManagedUsers(): Promise<ManagedUserDto[]> {
  const [rows] = await pool.execute<ManagedUserRow[]>(`${selectUserColumns} ORDER BY id`);
  return rows.map(toDto);
}

export async function getManagedUserById(id: number): Promise<ManagedUserDto | undefined> {
  const [rows] = await pool.execute<ManagedUserRow[]>(`${selectUserColumns} WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ? toDto(rows[0]) : undefined;
}

export async function getManagedUserByEmail(email: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  return rows.length > 0;
}

export async function getManagedUserProfileByGuid(guid: string): Promise<ProfileRow | undefined> {
  const [rows] = await pool.execute<ProfileRow[]>('SELECT perfil, status AS estatus FROM users WHERE guid = ? LIMIT 1', [guid]);
  return rows[0];
}

export async function createManagedUser(input: {
  nombre: string;
  email: string;
  passwordHash: string;
  perfil: 'Admin' | 'Visor';
  estatus: 'Activo' | 'Inactivo';
}): Promise<ManagedUserDto> {
  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO users
        (guid, email, name, password_hash, is_platform_admin, status, perfil)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), input.email, input.nombre, input.passwordHash, input.perfil === 'Admin' ? 1 : 0, databaseStatus(input.estatus), input.perfil],
    );
    const createdUser = await getManagedUserById(result.insertId);
    if (!createdUser) {
      throw new AppError('No se pudo recuperar el usuario recién creado.', {
        code: 'USER_CREATE_FAILED',
      });
    }
    return createdUser;
  } catch (error) {
    if (isDuplicateEmail(error)) {
      throw new AppError('Ya existe un usuario con ese correo electrónico.', {
        statusCode: 409,
        code: 'USER_EMAIL_ALREADY_EXISTS',
        field: 'email',
      });
    }
    throw error;
  }
}

export async function updateManagedUser(
  id: number,
  input: {
    nombre?: string;
    email?: string;
    passwordHash?: string;
    perfil?: 'Admin' | 'Visor';
    estatus?: 'Activo' | 'Inactivo';
  },
): Promise<ManagedUserDto | undefined> {
  const assignments: string[] = [];
  const values: (string | number)[] = [];

  if (input.nombre !== undefined) {
    assignments.push('name = ?');
    values.push(input.nombre);
  }
  if (input.email !== undefined) {
    assignments.push('email = ?');
    values.push(input.email);
  }
  if (input.passwordHash !== undefined) {
    assignments.push('password_hash = ?');
    values.push(input.passwordHash);
  }
  if (input.perfil !== undefined) {
    assignments.push('is_platform_admin = ?', 'perfil = ?');
    values.push(input.perfil === 'Admin' ? 1 : 0, input.perfil);
  }
  if (input.estatus !== undefined) {
    assignments.push('status = ?');
    values.push(databaseStatus(input.estatus));
  }

  try {
    values.push(id);
    await pool.execute<ResultSetHeader>(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`, values);
    return getManagedUserById(id);
  } catch (error) {
    if (isDuplicateEmail(error)) {
      throw new AppError('Ya existe un usuario con ese correo electrónico.', {
        statusCode: 409,
        code: 'USER_EMAIL_ALREADY_EXISTS',
        field: 'email',
      });
    }
    throw error;
  }
}

export async function deactivateManagedUser(id: number): Promise<ManagedUserDto | undefined> {
  const existing = await getManagedUserById(id);
  if (!existing) return undefined;
  if (existing.email.trim().toLowerCase() === SYSTEM_ADMIN_EMAIL) {
    throw systemAdminError();
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE users
     SET status = 'INACTIVE'
     WHERE id = ? AND LOWER(email) <> ?`,
    [id, SYSTEM_ADMIN_EMAIL],
  );

  if (result.affectedRows === 0) {
    const current = await getManagedUserById(id);
    if (current?.email.trim().toLowerCase() === SYSTEM_ADMIN_EMAIL) {
      throw systemAdminError();
    }
    if (!current) return undefined;
  }

  return getManagedUserById(id);
}
