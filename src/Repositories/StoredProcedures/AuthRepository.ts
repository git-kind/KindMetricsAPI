import { callRows } from './ProcedureExecutor.js';
export type DbUser = { id: number; guid: string; email: string; name: string; password_hash: string; is_platform_admin: number; status: string };

export async function byEmail(email: string) {
  return (await callRows<DbUser>('sp_auth_by_email', [email]))[0];
}

export async function byGuid(guid: string) {
  return (await callRows<DbUser>('sp_auth_by_guid', [guid]))[0];
}

export async function companyAccess(userGuid: string, companyGuid: string) {
  return (await callRows<{ id: number }>('sp_auth_company_access', [userGuid, companyGuid]))[0];
}

export async function permission(userGuid: string, companyGuid: string, permissionName: string) {
  return (await callRows<{ allowed: number }>('sp_auth_permission', [userGuid, companyGuid, permissionName]))[0];
}

export function createUser(guid: string, email: string, name: string, hash: string, companyId: number | null, actorId: number) {
  return callRows('sp_users_create', [guid, email, name, hash, companyId, actorId]);
}

export function listUsers(companyId: number | null) {
  return callRows('sp_users_list', [companyId]);
}

export function updateUser(guid: string, companyId: number | null, payload: object, actorId: number) {
  return callRows('sp_users_update', [guid, companyId, JSON.stringify(payload), actorId]);
}

export function deleteUser(guid: string, companyId: number | null, actorId: number) {
  return callRows('sp_users_delete', [guid, companyId, actorId]);
}
