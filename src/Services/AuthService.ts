import argon2 from 'argon2';
import { authRepository } from '../Repositories/StoredProcedures/AuthRepository.js';
export class AuthService {
  async login(email: string, password: string) {
    const user = await authRepository.byEmail(email.toLowerCase());
    if (!user || user.status !== 'ACTIVE' || !(await argon2.verify(user.password_hash, password))) return null;
    return { sub: user.guid, platformAdmin: Boolean(user.is_platform_admin), email: user.email, name: user.name };
  }
  async me(guid: string) { const user = await authRepository.byGuid(guid); return user ? { guid: user.guid, email: user.email, name: user.name } : null; }
}
