import { randomUUID } from 'node:crypto';
import { EntityRepository, type EntityName } from '../Repositories/StoredProcedures/EntityRepository.js';
export class EntityService {
  private readonly repository: EntityRepository;
  constructor(entity: EntityName) { this.repository = new EntityRepository(entity); }
  list(companyId: number | null) { return this.repository.list(companyId); }
  get(guid: string, companyId: number | null) { return this.repository.get(guid, companyId); }
  create(companyId: number | null, payload: object, actorId: number) { return this.repository.create(randomUUID(), companyId, payload, actorId); }
  update(guid: string, companyId: number | null, payload: object, actorId: number) { return this.repository.update(guid, companyId, payload, actorId); }
  delete(guid: string, companyId: number | null, actorId: number) { return this.repository.delete(guid, companyId, actorId); }
}
