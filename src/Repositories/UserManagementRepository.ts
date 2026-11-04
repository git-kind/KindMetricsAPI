import type { RowDataPacket } from 'mysql2';
import { randomUUID } from 'node:crypto';
import type { ManagedUserDto } from '../Models/Users/UserManagementDto.js';
import { callRows } from './StoredProcedures/ProcedureExecutor.js';

type ManagedUserRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  perfil: 'Admin' | 'Visor';
};

type EmailTakenRow = RowDataPacket & {
  is_taken: number | boolean;
};

export async function listManagedUsers(): Promise<ManagedUserDto[]> {
  const rows = await callRows<ManagedUserRow>('sp_user_management_list');
  return rows.map(({ id, name, email, perfil }) => ({
    id,
    nombre: name,
    email,
    perfil,
  }));
}

export async function getManagedUserById(id: number): Promise<ManagedUserDto | undefined> {
  const [row] = await callRows<ManagedUserRow>('sp_user_management_get_by_id', [id]);
  return row
    ? { id: row.id, nombre: row.name, email: row.email, perfil: row.perfil }
    : undefined;
}

export async function isManagedUserEmailTaken(
  email: string,
  excludeId: number | null = null,
): Promise<boolean> {
  const [row] = await callRows<EmailTakenRow>('sp_user_management_email_exists', [
    email,
    excludeId,
  ]);
  return row?.is_taken === true || Number(row?.is_taken) === 1;
}

export async function createManagedUser(input: {
  nombre: string;
  email: string;
  perfil: 'Admin' | 'Visor';
  passwordHash: string;
}): Promise<ManagedUserDto | undefined> {
  const [row] = await callRows<ManagedUserRow>('sp_user_management_create', [
    randomUUID(),
    input.email,
    input.nombre,
    input.perfil,
    input.passwordHash,
  ]);
  return row
    ? { id: row.id, nombre: row.name, email: row.email, perfil: row.perfil }
    : undefined;
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
  const payload = {
    ...(input.nombre !== undefined ? { name: input.nombre } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.perfil !== undefined ? { perfil: input.perfil } : {}),
    ...(input.passwordHash !== undefined ? { password_hash: input.passwordHash } : {}),
  };
  const [row] = await callRows<ManagedUserRow>('sp_user_management_update', [
    id,
    JSON.stringify(payload),
  ]);
  return row
    ? { id: row.id, nombre: row.name, email: row.email, perfil: row.perfil }
    : undefined;
}

export async function deactivateManagedUser(id: number): Promise<boolean> {
  const [row] = await callRows<{ deactivated: number | boolean } & RowDataPacket>(
    'sp_user_management_deactivate',
    [id],
  );
  return row?.deactivated === true || Number(row?.deactivated) === 1;
}
