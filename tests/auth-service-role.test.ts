import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  byEmail: vi.fn(),
  byGuid: vi.fn(),
  getCompanyManagementUserProfile: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('argon2', () => ({
  default: {
    verify: mocks.verify,
  },
}));

vi.mock('../src/Repositories/StoredProcedures/AuthRepository.js', () => ({
  byEmail: mocks.byEmail,
  byGuid: mocks.byGuid,
}));

vi.mock('../src/Repositories/CompanyManagementRepository.js', () => ({
  getCompanyManagementUserProfile: mocks.getCompanyManagementUserProfile,
}));

vi.mock('../src/Repositories/StoredProcedures/PasswordRecoveryRepository.js', () => ({
  getPasswordRecoveryTokenByEmail: vi.fn(),
  requestPasswordRecoveryToken: vi.fn(),
  resetPasswordWithRecoveryToken: vi.fn(),
}));

vi.mock('../src/Services/EmailService.js', () => ({
  enviarCorreoRecuperacion: vi.fn(),
}));

import { AuthService } from '../src/Services/AuthService.js';

describe('AuthService role resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue(true);
    mocks.getCompanyManagementUserProfile.mockResolvedValue('Editor');
  });

  it('resolves a missing auth-procedure role from the stored user profile', async () => {
    mocks.byEmail.mockResolvedValue({
      guid: 'user-guid',
      email: 'editor@example.com',
      name: 'Editor',
      password_hash: 'hash',
      is_platform_admin: 0,
      status: 'ACTIVE',
    });

    const user = await new AuthService().login('editor@example.com', 'password');

    expect(user?.role).toBe('Editor');
    expect(mocks.getCompanyManagementUserProfile).toHaveBeenCalledWith('user-guid');
  });

  it('uses Admin for platform administrators even when the procedure omits role fields', async () => {
    mocks.byEmail.mockResolvedValue({
      guid: 'admin-guid',
      email: 'admin@example.com',
      name: 'Admin',
      password_hash: 'hash',
      is_platform_admin: 1,
      status: 'ACTIVE',
    });

    const user = await new AuthService().login('admin@example.com', 'password');

    expect(user?.role).toBe('Admin');
    expect(mocks.getCompanyManagementUserProfile).not.toHaveBeenCalled();
  });
});
