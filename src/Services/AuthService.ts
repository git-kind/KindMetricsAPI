import argon2 from 'argon2';
import { byEmail, byGuid } from '../Repositories/StoredProcedures/AuthRepository.js';

function isActiveStatus(status: string): boolean {
  const normalizedStatus = status.trim().toUpperCase();
  return normalizedStatus === 'ACTIVE' || normalizedStatus === 'ACTIVO';
}

export class AuthService {
  async login(email: string, password: string) {
    const user = await byEmail(email.trim().toLowerCase());

    if (!user || !isActiveStatus(user.status) || !(await argon2.verify(user.password_hash, password))) {
      return null;
    }

    return {
      sub: user.guid,
      platformAdmin: Boolean(user.is_platform_admin),
      perfil: user.is_platform_admin ? ('Admin' as const) : ('Visor' as const),
      email: user.email,
      name: user.name,
    };
  }

  async me(guid: string) {
    const user = await byGuid(guid);

    return user
      ? {
          guid: user.guid,
          email: user.email,
          name: user.name,
          platformAdmin: Boolean(user.is_platform_admin),
          perfil: user.is_platform_admin ? ('Admin' as const) : ('Visor' as const),
        }
      : null;
  }
}
