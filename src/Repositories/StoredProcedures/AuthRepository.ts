import { callRows } from './ProcedureExecutor.js';
export type DbUser = { id: number; guid: string; email: string; name: string; password_hash: string; is_platform_admin: number; status: string };
export const authRepository = {
  byEmail: async (email: string) => (await callRows<DbUser>('sp_auth_by_email', [email]))[0],
  byGuid: async (guid: string) => (await callRows<DbUser>('sp_auth_by_guid', [guid]))[0],
  companyAccess: async (userGuid: string, companyGuid: string) => (await callRows<{ id: number }>('sp_auth_company_access', [userGuid, companyGuid]))[0],
  permission: async (userGuid: string, companyGuid: string, permission: string) => (await callRows<{ allowed: number }>('sp_auth_permission', [userGuid, companyGuid, permission]))[0],
  createUser: (guid: string, email: string, name: string, hash: string, companyId: number | null, actorId: number) => callRows('sp_users_create', [guid, email, name, hash, companyId, actorId]),
  listUsers: (companyId: number | null) => callRows('sp_users_list', [companyId]),
  updateUser: (guid: string, companyId: number | null, payload: object, actorId: number) => callRows('sp_users_update', [guid, companyId, JSON.stringify(payload), actorId]),
  deleteUser: (guid: string, companyId: number | null, actorId: number) => callRows('sp_users_delete', [guid, companyId, actorId])
};
