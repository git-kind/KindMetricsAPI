import { callRows } from './ProcedureExecutor.js';
export type EntityName = 'companies' | 'roles' | 'catalogs' | 'datasources' | 'folders' | 'dashboards' | 'panels' | 'settings';
export class EntityRepository {
  constructor(private readonly entity: EntityName) {}
  list(companyId: number | null) { return callRows<Record<string, unknown>>(`sp_${this.entity}_list`, [companyId]); }
  get(guid: string, companyId: number | null) { return callRows<Record<string, unknown>>(`sp_${this.entity}_get`, [guid, companyId]); }
  create(guid: string, companyId: number | null, payload: object, actorId: number) { return callRows<Record<string, unknown>>(`sp_${this.entity}_create`, [guid, companyId, JSON.stringify(payload), actorId]); }
  update(guid: string, companyId: number | null, payload: object, actorId: number) { return callRows<Record<string, unknown>>(`sp_${this.entity}_update`, [guid, companyId, JSON.stringify(payload), actorId]); }
  delete(guid: string, companyId: number | null, actorId: number) { return callRows<Record<string, unknown>>(`sp_${this.entity}_delete`, [guid, companyId, actorId]); }
}
