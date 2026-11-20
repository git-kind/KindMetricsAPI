import { randomUUID } from 'node:crypto';
import type { EntityName } from '../Models/EntityDto.js';
import { EntityRepository } from '../Repositories/StoredProcedures/EntityRepository.js';
import { actorId as resolveActorId } from '../Repositories/StoredProcedures/ActorRepository.js';
export class EntityService {
  private readonly repository: EntityRepository;
  constructor(entity: EntityName) { this.repository = new EntityRepository(entity); }
  list(companyId: number | null) { return this.repository.list(companyId); }
  get(guid: string, companyId: number | null) { return this.repository.get(guid, companyId); }
  async create(companyId: number | null, payload: object, userGuid: string) {
    const actorId = await resolveActorId(userGuid);
    return this.repository.create(randomUUID(), companyId, payload, actorId);
  }
  async update(guid: string, companyId: number | null, payload: object, userGuid: string) {
    const actorId = await resolveActorId(userGuid);
    return this.repository.update(guid, companyId, payload, actorId);
  }
  async delete(guid: string, companyId: number | null, userGuid: string) {
    const actorId = await resolveActorId(userGuid);
    return this.repository.delete(guid, companyId, actorId);
  }
}
