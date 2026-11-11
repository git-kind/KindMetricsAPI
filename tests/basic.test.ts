import { describe, it, expect } from 'vitest';
import { companyCreateSchema } from '../src/Models/Common.js';
import { loginRequestSchema } from '../src/Models/Auth/LoginRequestDto.js';
import { passwordRecoveryRequestSchema, passwordRecoveryUpdateSchema, passwordRecoveryValidateSchema } from '../src/Models/Auth/PasswordRecoveryDto.js';

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
});
