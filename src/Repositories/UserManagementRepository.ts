import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../Config/DatabaseConfig.js';
import type { ManagedUserDto } from '../Models/Users/UserManagementDto.js';

type ManagedUserRow = RowDataPacket & ManagedUserDto;

const userColumns = 'id, name AS nombre, email, perfil';

export async function listManagedUsers(): Promise<ManagedUserDto[]> {
  const [rows] = await pool.execute<ManagedUserRow[]>(
    `SELECT ${userColumns}
     FROM users
     WHERE UPPER(TRIM(status)) IN ('ACTIVE', 'ACTIVO')
     ORDER BY name, email`,
  );
  return rows;
}

export async function getManagedUserById(id: number): Promise<ManagedUserDto | undefined> {
  const [rows] = await pool.execute<ManagedUserRow[]>(
    `SELECT ${userColumns}
     FROM users
     WHERE id = ?
       AND UPPER(TRIM(status)) IN ('ACTIVE', 'ACTIVO')
     LIMIT 1`,
    [id],
  );
  return rows[0];
}

export async function createManagedUser(input: {
  nombre: string;
  email: string;
  perfil: 'Admin' | 'Visor';
  passwordHash: string;
}): Promise<ManagedUserDto | undefined> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO users (guid, name, email, password_hash, perfil, status)
     VALUES (UUID(), ?, ?, ?, ?, 'ACTIVE')`,
    [input.nombre, input.email, input.passwordHash, input.perfil],
  );
  return getManagedUserById(result.insertId);
}

export async function updateManagedUser(
  id: number,
  input: {
    nombre?: string;
    email?: string;
    perfil?: 'Admin' | 'Visor';
    passwordHash?: string;
  },
): Promise<ManagedUserDto | undefined> {
  const assignments: string[] = [];
  const values: string[] = [];

  if (input.nombre !== undefined) {
    assignments.push('name = ?');
    values.push(input.nombre);
  }
  if (input.email !== undefined) {
    assignments.push('email = ?');
    values.push(input.email);
  }
  if (input.perfil !== undefined) {
    assignments.push('perfil = ?');
    values.push(input.perfil);
  }
  if (input.passwordHash !== undefined) {
    assignments.push('password_hash = ?');
    values.push(input.passwordHash);
  }

  values.push(String(id));
  await pool.execute<ResultSetHeader>(
    `UPDATE users
     SET ${assignments.join(', ')}
     WHERE id = ?
       AND UPPER(TRIM(status)) IN ('ACTIVE', 'ACTIVO')`,
    values,
  );
  return getManagedUserById(id);
}

export async function deactivateManagedUser(id: number): Promise<boolean> {
  if (id <= 0) {
    return false;
  }
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE users
     SET status = 'INACTIVE'
     WHERE id = ?
       AND UPPER(TRIM(status)) IN ('ACTIVE', 'ACTIVO')
       AND LOWER(email) <> 'admin@kindtech.com'`,
    [id],
  );
  return result.affectedRows > 0;
}

export async function isManagedUserEmailTaken(email: string, exceptId?: number): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id
     FROM users
     WHERE LOWER(email) = ?
       AND (? IS NULL OR id <> ?)
     LIMIT 1`,
    [email.toLowerCase(), exceptId ?? null, exceptId ?? null],
  );
  return rows.length > 0;
}
