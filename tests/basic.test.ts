import { describe, it, expect } from 'vitest';
import { companyCreateSchema } from '../src/Models/Common.js';
import { loginRequestSchema } from '../src/Models/Auth/LoginRequestDto.js';

describe('DTOs', () => {
  it('rejects empty company name', () => {
    expect(companyCreateSchema.safeParse({ name: '', code: 'AA' }).success).toBe(false);
  });

  it('validates the login contract and rejects invalid email', () => {
    expect(loginRequestSchema.safeParse({ email: 'admin@kindtech.com', password: 'secret123' }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ email: 'incorrect-email', password: 'secret123' }).success).toBe(false);
  });
});
