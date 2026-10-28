import argon2 from 'argon2';
import { byEmail, byGuid } from '../Repositories/StoredProcedures/AuthRepository.js';
export class AuthService {
  async login(email: string, password: string) {
    const user = await byEmail(email.toLowerCase());
    if (!user || user.status !== 'ACTIVE' || !(await argon2.verify(user.password_hash, password))) return null;
    return { sub: user.guid, platformAdmin: Boolean(user.is_platform_admin), email: user.email, name: user.name };
  }
  async refreshSession(guid: string) {
    const user = await byGuid(guid);
    const status = user?.status.trim().toUpperCase();
    if (!user || (status !== 'ACTIVE' && status !== 'ACTIVO')) return null;
    return {
      sub: user.guid,
      platformAdmin: Boolean(user.is_platform_admin),
      email: user.email,
      name: user.name,
    };
  }
  async me(guid: string) { const user = await byGuid(guid); return user ? { guid: user.guid, email: user.email, name: user.name, platformAdmin: Boolean(user.is_platform_admin) } : null; }
}
