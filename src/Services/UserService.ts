import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { CreateUserRequestDto } from '../Models/Users/CreateUserRequestDto.js';
import { actorId } from '../Repositories/StoredProcedures/ActorRepository.js';
import { createUser, deleteUser, listUsers, updateUser } from '../Repositories/StoredProcedures/AuthRepository.js';

export class UserService {
  list(companyId: number | null) {
    return listUsers(companyId);
  }

  async create(companyId: number | null, input: CreateUserRequestDto, userGuid: string) {
    const passwordHash = await argon2.hash(input.password);
    const actor = await actorId(userGuid);
    return createUser(randomUUID(), input.email.toLowerCase(), input.name, passwordHash, companyId, actor);
  }

  async update(guid: string, companyId: number | null, payload: object, userGuid: string) {
    const actor = await actorId(userGuid);
    return updateUser(guid, companyId, payload, actor);
  }

  async delete(guid: string, companyId: number | null, userGuid: string) {
    const actor = await actorId(userGuid);
    return deleteUser(guid, companyId, actor);
  }
}
