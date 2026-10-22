import argon2 from 'argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/Repositories/StoredProcedures/AuthRepository.js', () => ({
  byEmail: vi.fn(),
  byGuid: vi.fn(),
}));

import { byEmail } from '../src/Repositories/StoredProcedures/AuthRepository.js';
import { AuthService } from '../src/Services/AuthService.js';

const mockedByEmail = vi.mocked(byEmail);
const service = new AuthService();

describe('AuthService login status normalization', () => {
  beforeEach(() => {
    mockedByEmail.mockReset();
  });

  it.each(['ACTIVE', 'Active', 'Activo', 'activo'])('accepts the active status %s for an Argon2 account', async (status) => {
    mockedByEmail.mockResolvedValue({
      id: 1,
      guid: 'user-guid',
      email: 'user@example.com',
      name: 'Test User',
      password_hash: await argon2.hash('correct-password'),
      is_platform_admin: 1,
      status,
    });

    await expect(service.login('user@example.com', 'correct-password')).resolves.toMatchObject({
      sub: 'user-guid',
      perfil: 'Admin',
    });
  });

  it('rejects a wrong password', async () => {
    mockedByEmail.mockResolvedValue({
      id: 1,
      guid: 'user-guid',
      email: 'user@example.com',
      name: 'Test User',
      password_hash: await argon2.hash('correct-password'),
      is_platform_admin: 0,
      status: 'ACTIVE',
    });

    await expect(service.login('user@example.com', 'correct-password')).resolves.toMatchObject({
      perfil: 'Visor',
    });
    await expect(service.login('user@example.com', 'wrong-password')).resolves.toBeNull();
  });
});
