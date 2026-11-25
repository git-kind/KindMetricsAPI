import { describe, it, expect } from 'vitest';
import { companyCreateSchema } from '../src/Models/Common.js';
import { loginRequestSchema } from '../src/Models/Auth/LoginRequestDto.js';
import { passwordRecoveryRequestSchema, passwordRecoveryUpdateSchema, passwordRecoveryValidateSchema } from '../src/Models/Auth/PasswordRecoveryDto.js';
import { createManagedUserSchema } from '../src/Models/Users/UserManagementDto.js';
import { normalizeUserRole } from '../src/Models/Auth/UserRole.js';

describe('DTOs', () => {
  it('rejects empty company name', () => {
    expect(companyCreateSchema.safeParse({ name: '', code: 'AA' }).success).toBe(false);
  });

  it('validates the login contract and rejects invalid email', () => {
    expect(loginRequestSchema.safeParse({ email: 'admin@kindtech.com', password: 'secret123' }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ email: 'incorrect-email', password: 'secret123' }).success).toBe(false);
  });

  it('validates the password recovery contracts', () => {
    expect(passwordRecoveryRequestSchema.safeParse({ email: 'user@example.com' }).success).toBe(true);
    expect(passwordRecoveryValidateSchema.safeParse({ email: 'user@example.com', otp: '123456' }).success).toBe(true);
    expect(passwordRecoveryValidateSchema.safeParse({ email: 'user@example.com', otp: 'ABC123' }).success).toBe(false);
    expect(passwordRecoveryUpdateSchema.safeParse({ email: 'user@example.com', otp: '123456', password: 'password123' }).success).toBe(true);
    expect(passwordRecoveryUpdateSchema.safeParse({ email: 'user@example.com', otp: '123456', password: 'short' }).success).toBe(false);
  });

  it('accepts the Editor profile when creating a managed user', () => {
    expect(
      createManagedUserSchema.safeParse({
        nombre: 'Editor de prueba',
        email: 'editor@example.com',
        perfil: 'Editor',
        password: 'password123',
      }).success,
    ).toBe(true);
  });

  it('accepts the Viewer profile when creating a managed user', () => {
    expect(
      createManagedUserSchema.safeParse({
        nombre: 'Visualizador de prueba',
        email: 'viewer@example.com',
        perfil: 'Viewer',
        password: 'password123',
      }).success,
    ).toBe(true);
  });

  it('normalizes the legacy Visor role to Viewer', () => {
    expect(normalizeUserRole('Visor')).toBe('Viewer');
    expect(normalizeUserRole('Viewer')).toBe('Viewer');
    expect(normalizeUserRole('Unknown')).toBeUndefined();
  });
});
