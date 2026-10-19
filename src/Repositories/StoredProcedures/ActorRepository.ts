import { callRows } from './ProcedureExecutor.js';
export async function actorId(userGuid: string) { const rows = await callRows<{ id: number }>('sp_auth_actor_id', [userGuid]); if (!rows[0]) throw new Error('User not found'); return rows[0].id; }
